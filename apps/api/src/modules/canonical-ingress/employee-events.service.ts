import { Injectable } from "@nestjs/common";
import { Severity, UserRole, WorkType } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AiService } from "../ai/ai.service";
import { ConversationService } from "../conversation/conversation.service";
import { OperationsService } from "../operations/operations.service";
import { PayrollService } from "../payroll/payroll.service";
import { RemindersService } from "../reminders/reminders.service";
import { WorkItemsService } from "../work-items/work-items.service";
import { CanonicalIngressSupportService } from "./canonical-ingress.support";
import { CanonicalIntegrationAuthContext, EmployeeEventPayload } from "./canonical-ingress.types";

@Injectable()
export class EmployeeEventsService {
  constructor(
    private readonly support: CanonicalIngressSupportService,
    private readonly conversationService: ConversationService,
    private readonly operationsService: OperationsService,
    private readonly payrollService: PayrollService,
    private readonly aiService: AiService,
    private readonly remindersService: RemindersService,
    private readonly auditService: AuditService,
    private readonly workItemsService: WorkItemsService
  ) {}

  async ingest(
    auth: CanonicalIntegrationAuthContext,
    idempotencyKey: string,
    body: EmployeeEventPayload
  ) {
    this.support.ensureScope(auth, "employee_events", "conversation", "check_in", "check_out", "incidents", "warehouse", "payroll:read");
    this.support.ensureIdempotencyKey(idempotencyKey);

    return this.support.executeIdempotent(auth, "employee_event", idempotencyKey, body, async () => {
      return this.processEvent({
        tenantId: auth.tenantId,
        integrationName: auth.integrationName,
        body
      });
    });
  }

  async processEvent(params: {
    tenantId: string;
    integrationName?: string;
    body: EmployeeEventPayload;
  }) {
    const user = await this.support.findEmployee(params.tenantId, params.body.employeeCode);
    const endpoint = params.body.endpointExternalId
      ? await this.support.upsertUserChannelEndpoint({
          tenantId: params.tenantId,
          userId: user.id,
          channel: params.body.channel,
          provider: params.body.provider,
          endpointExternalId: params.body.endpointExternalId,
          label: params.body.endpointExternalId
        })
      : null;

    const session = await this.conversationService.getOrCreateSession(
      params.tenantId,
      user.id,
      params.body.channel
    );

    const commonMessageContext = {
      tenantId: params.tenantId,
      sessionId: session.id,
      userId: user.id,
      channelEndpointId: endpoint?.id
    };

    switch (params.body.eventType) {
      case "route.start": {
        const vehicleLabel = String(params.body.payload.vehicleLabel ?? "");
        const odometer = Number(params.body.payload.odometer);
        const route = await this.operationsService.startDriverRoute({
          tenantId: params.tenantId,
          userId: user.id,
          sessionId: session.id,
          vehicleLabel,
          odometer
        });
        await this.workItemsService.acknowledgeAssignedWorkItem({
          tenantId: params.tenantId,
          userId: user.id,
          details: "Trabajo reconocido al iniciar ruta",
          workTypes: [WorkType.route],
          hints: {
            vehicleLabel
          }
        });
        await this.auditService.log({
          tenantId: params.tenantId,
          actorUserId: user.id,
          action: "employee_event.route_start",
          targetType: "driver_route",
          targetId: route.id,
          meta: { integrationName: params.integrationName, channel: params.body.channel, provider: params.body.provider }
        });
        return {
          completed: true,
          assistantMessage: `Ruta iniciada. Camion ${vehicleLabel}, km ${odometer}.`,
          appliedAction: { type: "driver_route_started", routeId: route.id }
        };
      }

      case "route.end": {
        const odometer = Number(params.body.payload.odometer);
        const invoices = Array.isArray(params.body.payload.invoices)
          ? params.body.payload.invoices.map((value) => String(value))
          : [];
        const route = await this.operationsService.closeDriverRoute({
          tenantId: params.tenantId,
          userId: user.id,
          odometer,
          invoices
        });
        await this.workItemsService.completeAssignedWorkItem({
          tenantId: params.tenantId,
          userId: user.id,
          details: "Trabajo completado al cerrar ruta",
          workTypes: [WorkType.route],
          hints: {
            vehicleLabel: route.vehicleLabel
          }
        });
        return {
          completed: true,
          assistantMessage: `Ruta cerrada. Km final ${odometer}.`,
          appliedAction: { type: "driver_route_closed", routeId: route.id }
        };
      }

      case "warehouse.picking": {
        const picking = await this.operationsService.createWarehousePicking({
          tenantId: params.tenantId,
          userId: user.id,
          sessionId: session.id,
          orderRef: String(params.body.payload.orderRef ?? ""),
          routeRef: this.optionalString(params.body.payload.routeRef),
          vehicleLabel: this.optionalString(params.body.payload.vehicleLabel),
          notes: this.optionalString(params.body.payload.notes)
        });
        await this.workItemsService.acknowledgeAssignedWorkItem({
          tenantId: params.tenantId,
          userId: user.id,
          details: "Trabajo reconocido al registrar picking",
          workTypes: [WorkType.order],
          hints: {
            orderRef: String(params.body.payload.orderRef ?? ""),
            routeRef: this.optionalString(params.body.payload.routeRef)
          }
        });
        return {
          completed: true,
          assistantMessage: "Picking registrado.",
          appliedAction: { type: "warehouse_picking_created", pickingId: picking.id }
        };
      }

      case "warehouse.loading": {
        const loading = await this.operationsService.createTruckLoading({
          tenantId: params.tenantId,
          userId: user.id,
          sessionId: session.id,
          vehicleLabel: String(params.body.payload.vehicleLabel ?? ""),
          boxCount: this.optionalNumber(params.body.payload.boxCount),
          weightKg: this.optionalNumber(params.body.payload.weightKg),
          notes: this.optionalString(params.body.payload.notes)
        });
        await this.workItemsService.acknowledgeAssignedWorkItem({
          tenantId: params.tenantId,
          userId: user.id,
          details: "Trabajo reconocido al registrar carga",
          workTypes: [WorkType.route, WorkType.order],
          hints: {
            vehicleLabel: String(params.body.payload.vehicleLabel ?? "")
          }
        });
        return {
          completed: true,
          assistantMessage: "Carga registrada.",
          appliedAction: { type: "warehouse_loading_created", loadingId: loading.id }
        };
      }

      case "incident.report": {
        const sourceType = this.optionalString(params.body.payload.sourceType) === "warehouse" ? "warehouse" : "driver";
        const description = String(params.body.payload.description ?? params.body.payload.text ?? "");
        const severity = (this.optionalString(params.body.payload.severity) as Severity | null) ?? this.aiService.classifySeverity(description);
        const incidentType = this.optionalString(params.body.payload.incidentType) ?? this.detectIncidentType(description);
        const title = this.optionalString(params.body.payload.title) ?? (sourceType === "warehouse" ? "Incidencia de almacen" : "Incidencia de ruta");
        const incident =
          sourceType === "warehouse"
            ? await this.operationsService.registerWarehouseIncident({
                tenantId: params.tenantId,
                userId: user.id,
                title,
                description,
                severity,
                incidentType
              })
            : await this.operationsService.registerDriverIncident({
                tenantId: params.tenantId,
                userId: user.id,
                title,
                description,
                severity,
                incidentType
              });
        return {
          completed: true,
          assistantMessage:
            severity === "high" || severity === "critical"
              ? "Incidencia registrada como grave. Ya se enviaron alertas."
              : "Incidencia registrada.",
          appliedAction: { type: "incident_created", incidentId: incident.id }
        };
      }

      case "payroll.query": {
        const payroll = await this.payrollService.getLatestPayrollForEmployee(params.tenantId, user.id);
        if (!payroll) {
          return {
            completed: true,
            assistantMessage: "No tengo una nomina disponible para tu usuario.",
            appliedAction: { type: "payroll_not_found" }
          };
        }
        return {
          completed: true,
          assistantMessage: `Nomina disponible ${payroll.payroll.periodMonth}/${payroll.payroll.periodYear}.`,
          appliedAction: { type: "payroll_found", payrollId: payroll.payroll.id },
          outboundDocuments: [
            {
              fileName: `nomina-${payroll.payroll.periodYear}-${payroll.payroll.periodMonth}.pdf`,
              mimeType: "application/pdf",
              caption: `Nomina ${payroll.payroll.periodMonth}/${payroll.payroll.periodYear}`,
              fileBase64: payroll.buffer.toString("base64")
            }
          ]
        };
      }

      case "reminder.create": {
        const dueAt = this.parseDueAt(this.optionalString(params.body.payload.when));
        const reminder = await this.remindersService.createReminder({
          tenantId: params.tenantId,
          userId: user.id,
          createdByUserId: user.id,
          type: "personal",
          title: String(params.body.payload.title ?? params.body.payload.text ?? ""),
          dueAt
        });
        return {
          completed: true,
          assistantMessage: `Recordatorio guardado para ${dueAt.toLocaleString("es-DO")}.`,
          appliedAction: { type: "reminder_created", reminderId: reminder.id }
        };
      }

      case "conversation.audio":
      case "conversation.message":
      default: {
        const text =
          params.body.eventType === "conversation.audio"
            ? await this.aiService.transcribeAudio(
                params.tenantId,
                Buffer.from(String(params.body.payload.base64Audio ?? ""), "base64")
              )
            : String(params.body.payload.text ?? "");

        const reminderOutcome = await this.tryHandleReminder(params.tenantId, user.id, user.roles.map((role) => role.role), text);
        if (reminderOutcome) {
          await this.conversationService.saveInboundMessage({
            ...commonMessageContext,
            messageType: params.body.eventType === "conversation.audio" ? "audio" : "text",
            rawText: params.body.eventType === "conversation.audio" ? undefined : text,
            transcriptText: params.body.eventType === "conversation.audio" ? text : undefined,
            intent: "help"
          });
          await this.conversationService.saveOutboundMessage({
            ...commonMessageContext,
            text: reminderOutcome.assistantMessage
          });
          return reminderOutcome;
        }

        const assignedWorkSummary = await this.workItemsService.buildAssignedWorkSummary(
          params.tenantId,
          user.id
        );
        const classified = await this.aiService.classifyMessage(params.tenantId, text, {
          roles: user.roles.map((role) => role.role),
          assignedWorkSummary
        });

        const inboundMessage = await this.conversationService.saveInboundMessage({
          ...commonMessageContext,
          messageType: params.body.eventType === "conversation.audio" ? "audio" : "text",
          rawText: params.body.eventType === "conversation.audio" ? undefined : text,
          transcriptText: params.body.eventType === "conversation.audio" ? text : undefined,
          intent: classified.intent,
          confidence: classified.confidence,
          entities: classified.entities
        });

        const resolution = await this.resolveNaturalIntent({
          tenantId: params.tenantId,
          userId: user.id,
          sessionId: session.id,
          text,
          sourceMessageId: inboundMessage.id,
          classified
        });

        await this.conversationService.saveOutboundMessage({
          ...commonMessageContext,
          text: resolution.assistantMessage
        });

        return resolution;
      }
    }
  }

  private async resolveNaturalIntent(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    text: string;
    sourceMessageId?: string;
    classified: {
      intent: string;
      confidence: number;
      entities: Record<string, string | number>;
    };
  }) {
    switch (params.classified.intent) {
      case "driver_route_start": {
        const missingFields = this.getMissingFields(params.classified.intent, params.classified.entities);
        if (missingFields.length > 0) {
          return {
            completed: false,
            intent: params.classified.intent,
            confidence: params.classified.confidence,
            entities: params.classified.entities,
            missingFields,
            appliedAction: null,
            assistantMessage: await this.aiService.buildClarificationMessage(params.tenantId, params.classified.intent, missingFields)
          };
        }
        const route = await this.operationsService.startDriverRoute({
          tenantId: params.tenantId,
          userId: params.userId,
          sessionId: params.sessionId,
          vehicleLabel: String(params.classified.entities.vehicleLabel),
          odometer: Number(params.classified.entities.odometer)
        });
        await this.workItemsService.acknowledgeAssignedWorkItem({
          tenantId: params.tenantId,
          userId: params.userId,
          details: "Trabajo reconocido al iniciar ruta",
          workTypes: [WorkType.route],
          hints: {
            vehicleLabel: String(params.classified.entities.vehicleLabel)
          }
        });
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: { type: "driver_route_started", routeId: route.id },
          assistantMessage: `Ruta iniciada. Camion ${params.classified.entities.vehicleLabel}, km ${params.classified.entities.odometer}.`
        };
      }

      case "driver_route_end": {
        const missingFields = this.getMissingFields(params.classified.intent, params.classified.entities);
        if (missingFields.length > 0) {
          return {
            completed: false,
            intent: params.classified.intent,
            confidence: params.classified.confidence,
            entities: params.classified.entities,
            missingFields,
            appliedAction: null,
            assistantMessage: await this.aiService.buildClarificationMessage(params.tenantId, params.classified.intent, missingFields)
          };
        }
        const invoices = String(params.classified.entities.invoices ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const route = await this.operationsService.closeDriverRoute({
          tenantId: params.tenantId,
          userId: params.userId,
          odometer: Number(params.classified.entities.odometer),
          invoices
        });
        await this.workItemsService.completeAssignedWorkItem({
          tenantId: params.tenantId,
          userId: params.userId,
          details: "Trabajo completado al cerrar ruta",
          workTypes: [WorkType.route],
          hints: {
            vehicleLabel: route.vehicleLabel
          }
        });
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: { type: "driver_route_closed", routeId: route.id },
          assistantMessage: `Ruta cerrada. Km final ${params.classified.entities.odometer}.`
        };
      }

      case "warehouse_picking": {
        const missingFields = this.getMissingFields(params.classified.intent, params.classified.entities);
        if (missingFields.length > 0) {
          return {
            completed: false,
            intent: params.classified.intent,
            confidence: params.classified.confidence,
            entities: params.classified.entities,
            missingFields,
            appliedAction: null,
            assistantMessage: await this.aiService.buildClarificationMessage(params.tenantId, params.classified.intent, missingFields)
          };
        }
        const picking = await this.operationsService.createWarehousePicking({
          tenantId: params.tenantId,
          userId: params.userId,
          sessionId: params.sessionId,
          orderRef: String(params.classified.entities.orderRef),
          routeRef: this.optionalString(params.classified.entities.routeRef),
          vehicleLabel: this.optionalString(params.classified.entities.vehicleLabel),
          notes: params.text
        });
        await this.workItemsService.acknowledgeAssignedWorkItem({
          tenantId: params.tenantId,
          userId: params.userId,
          details: "Trabajo reconocido al registrar picking",
          workTypes: [WorkType.order],
          hints: {
            orderRef: String(params.classified.entities.orderRef),
            routeRef: this.optionalString(params.classified.entities.routeRef)
          }
        });
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: { type: "warehouse_picking_created", pickingId: picking.id },
          assistantMessage: "Picking registrado."
        };
      }

      case "warehouse_loading": {
        const missingFields = this.getMissingFields(params.classified.intent, params.classified.entities);
        if (missingFields.length > 0) {
          return {
            completed: false,
            intent: params.classified.intent,
            confidence: params.classified.confidence,
            entities: params.classified.entities,
            missingFields,
            appliedAction: null,
            assistantMessage: await this.aiService.buildClarificationMessage(params.tenantId, params.classified.intent, missingFields)
          };
        }
        const loading = await this.operationsService.createTruckLoading({
          tenantId: params.tenantId,
          userId: params.userId,
          sessionId: params.sessionId,
          vehicleLabel: String(params.classified.entities.vehicleLabel),
          boxCount: this.optionalNumber(params.classified.entities.boxCount),
          weightKg: this.optionalNumber(params.classified.entities.weightKg),
          notes: params.text
        });
        await this.workItemsService.acknowledgeAssignedWorkItem({
          tenantId: params.tenantId,
          userId: params.userId,
          details: "Trabajo reconocido al registrar carga",
          workTypes: [WorkType.route, WorkType.order],
          hints: {
            vehicleLabel: String(params.classified.entities.vehicleLabel)
          }
        });
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: { type: "warehouse_loading_created", loadingId: loading.id },
          assistantMessage: "Carga registrada."
        };
      }

      case "driver_incident":
      case "warehouse_incident": {
        const severity = this.aiService.classifySeverity(params.text);
        const incident =
          params.classified.intent === "warehouse_incident"
            ? await this.operationsService.registerWarehouseIncident({
                tenantId: params.tenantId,
                userId: params.userId,
                title: "Incidencia de almacen",
                description: params.text,
                severity,
                incidentType: this.detectIncidentType(params.text)
              })
            : await this.operationsService.registerDriverIncident({
                tenantId: params.tenantId,
                userId: params.userId,
                title: "Incidencia de ruta",
                description: params.text,
                severity,
                incidentType: this.detectIncidentType(params.text)
              });

        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: { type: "incident_created", incidentId: incident.id },
          assistantMessage:
            severity === "high" || severity === "critical"
              ? "Incidencia registrada como grave. Ya se enviaron alertas."
              : "Incidencia registrada."
        };
      }

      case "hr_payroll_query": {
        const payroll = await this.payrollService.getLatestPayrollForEmployee(params.tenantId, params.userId);
        if (!payroll) {
          return {
            completed: true,
            intent: params.classified.intent,
            confidence: params.classified.confidence,
            entities: params.classified.entities,
            missingFields: [],
            appliedAction: { type: "payroll_not_found" },
            assistantMessage: "No tengo una nomina disponible para tu usuario."
          };
        }
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: { type: "payroll_found", payrollId: payroll.payroll.id },
          assistantMessage: `Nomina disponible ${payroll.payroll.periodMonth}/${payroll.payroll.periodYear}.`,
          outboundDocuments: [
            {
              fileName: `nomina-${payroll.payroll.periodYear}-${payroll.payroll.periodMonth}.pdf`,
              mimeType: "application/pdf",
              caption: `Nomina ${payroll.payroll.periodMonth}/${payroll.payroll.periodYear}`,
              fileBase64: payroll.buffer.toString("base64")
            }
          ]
        };
      }

      case "assigned_work_query": {
        const summary = await this.workItemsService.buildAssignedWorkSummary(
          params.tenantId,
          params.userId
        );
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: { type: "assigned_work_summary" },
          assistantMessage: summary
        };
      }

      case "assigned_work_detail_query": {
        const detail = await this.workItemsService.buildAssignedWorkDetail(
          params.tenantId,
          params.userId
        );
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: { type: "assigned_work_detail" },
          assistantMessage: detail
        };
      }

      case "assigned_work_acknowledge": {
        const result = await this.workItemsService.acknowledgeCurrentAssignedWorkItem(
          params.tenantId,
          params.userId
        );
        const ambiguousItems = result && "ambiguous" in result ? (result.items ?? []) : [];
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: { type: "assigned_work_acknowledged" },
          assistantMessage: !result
            ? "No tienes trabajos asignados pendientes."
            : "ambiguous" in result
              ? `Tienes varios trabajos activos. No marco ninguno todavia: ${ambiguousItems
                  .slice(0, 3)
                  .map((item, index) => `${index + 1}. ${item.title}`)
                  .join(" ; ")}.`
            : result.changed
              ? `Trabajo recibido: ${result.workItem.title}.`
              : `Ese trabajo ya estaba recibido: ${result.workItem.title}.`
        };
      }

      case "assigned_work_complete": {
        const result = await this.workItemsService.completeCurrentAssignedWorkItem(
          params.tenantId,
          params.userId
        );
        const ambiguousItems = result && "ambiguous" in result ? (result.items ?? []) : [];
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: { type: "assigned_work_completed" },
          assistantMessage: !result
            ? "No tienes trabajos asignados pendientes."
            : "ambiguous" in result
              ? `Tienes varios trabajos activos. No completo ninguno todavia: ${ambiguousItems
                  .slice(0, 3)
                  .map((item, index) => `${index + 1}. ${item.title}`)
                  .join(" ; ")}.`
            : `Trabajo completado: ${result.workItem.title}.`
        };
      }

      case "operational_memory_note": {
        const memoryCapture = await this.workItemsService.captureEmployeeMemoryFromConversation({
          tenantId: params.tenantId,
          userId: params.userId,
          content: params.text,
          sourceMessageId: params.sourceMessageId
        });

        if (!memoryCapture) {
          return {
            completed: false,
            intent: params.classified.intent,
            confidence: params.classified.confidence,
            entities: params.classified.entities,
            missingFields: [],
            appliedAction: null,
            assistantMessage:
              "Entendi que me estas dando una nota operativa, pero ahora mismo no puedo asociarla a un trabajo activo."
          };
        }

        if ("ambiguous" in memoryCapture) {
          const ambiguousItems = memoryCapture.items ?? [];
          return {
            completed: false,
            intent: params.classified.intent,
            confidence: params.classified.confidence,
            entities: params.classified.entities,
            missingFields: [],
            appliedAction: null,
            assistantMessage: `Tienes varios trabajos activos. No guardo la nota todavia: ${ambiguousItems
              .slice(0, 3)
              .map((item, index) => `${index + 1}. ${item.title}`)
              .join(" ; ")}.`
          };
        }

        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: {
            type: "operational_memory_captured",
            noteId: memoryCapture.note.id,
            workItemId: memoryCapture.workItem.id
          },
          assistantMessage: this.buildOperationalMemoryCaptureMessage(memoryCapture)
        };
      }

      case "greeting":
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: null,
          assistantMessage: await this.aiService.buildGreetingMessage(params.tenantId)
        };

      case "help":
        return {
          completed: true,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: null,
          assistantMessage: await this.aiService.buildHelpMessage(params.tenantId)
        };

      default:
        {
          const memoryCapture = await this.workItemsService.captureEmployeeMemoryFromConversation({
            tenantId: params.tenantId,
            userId: params.userId,
            content: params.text,
            sourceMessageId: params.sourceMessageId
          });

          if (memoryCapture && !("ambiguous" in memoryCapture)) {
            return {
              completed: true,
              intent: "operational_memory_note",
              confidence: Math.max(params.classified.confidence, memoryCapture.suggestion.confidence),
              entities: params.classified.entities,
              missingFields: [],
              appliedAction: {
                type: "operational_memory_captured",
                noteId: memoryCapture.note.id,
                workItemId: memoryCapture.workItem.id
              },
              assistantMessage: this.buildOperationalMemoryCaptureMessage(memoryCapture)
            };
          }
        }
        return {
          completed: false,
          intent: params.classified.intent,
          confidence: params.classified.confidence,
          entities: params.classified.entities,
          missingFields: [],
          appliedAction: null,
          assistantMessage: await this.aiService.buildUnknownMessage(params.tenantId)
        };
    }
  }

  private async tryHandleReminder(
    tenantId: string,
    userId: string,
    roles: UserRole[],
    text: string
  ) {
    const normalized = text.toLowerCase().trim();
    if (!normalized) {
      return null;
    }

    if (!normalized.startsWith("recordar ") && !normalized.startsWith("recordatorio ")) {
      return null;
    }

    const dueAt = this.parseDueAt(normalized.includes("manana") ? "manana" : undefined);
    const reminder = await this.remindersService.createReminder({
      tenantId,
      userId,
      createdByUserId: userId,
      type: roles.some((role) => role === UserRole.manager || role === UserRole.admin) && normalized.includes("equipo")
        ? "system"
        : "personal",
      title: text.replace(/^(recordar|recordatorio)\s+/i, "").trim(),
      dueAt
    });

    return {
      completed: true,
      intent: "reminder_create",
      confidence: 1,
      entities: {},
      missingFields: [],
      appliedAction: { type: "reminder_created", reminderId: reminder.id },
      assistantMessage: `Recordatorio guardado para ${dueAt.toLocaleString("es-DO")}.`
    };
  }

  private getMissingFields(intent: string, entities: Record<string, string | number>) {
    const requirements: Record<string, string[]> = {
      driver_route_start: ["vehicleLabel", "odometer"],
      driver_route_end: ["odometer"],
      warehouse_picking: ["orderRef"],
      warehouse_loading: ["vehicleLabel"]
    };

    return (requirements[intent] ?? []).filter((field) => entities[field] === undefined);
  }

  private detectIncidentType(text: string) {
    const normalized = text.toLowerCase();
    if (normalized.includes("accidente")) return "accident";
    if (normalized.includes("pinchada")) return "flat_tire";
    if (normalized.includes("averia")) return "breakdown";
    if (normalized.includes("frio")) return "cold_chain_issue";
    if (normalized.includes("rechazo")) return "major_rejection";
    return "general";
  }

  private buildOperationalMemoryCaptureMessage(memoryCapture: {
    workItem: {
      title: string;
      account?: { name: string } | null;
      contactPerson?: { fullName: string } | null;
    };
    suggestion: {
      target: "work_item" | "account" | "person";
    };
  }) {
    if (memoryCapture.suggestion.target === "account" && memoryCapture.workItem.account?.name) {
      return `Anotado. Lo guardo como regla operativa de ${memoryCapture.workItem.account.name}.`;
    }

    if (memoryCapture.suggestion.target === "person" && memoryCapture.workItem.contactPerson?.fullName) {
      return `Anotado. Lo guardo como preferencia de ${memoryCapture.workItem.contactPerson.fullName}.`;
    }

    return `Anotado. Lo guardo en tu trabajo actual: ${memoryCapture.workItem.title}.`;
  }

  private parseDueAt(when?: string | null) {
    const dueAt = new Date(Date.now() + 60 * 60 * 1000);
    if (when?.includes("manana")) {
      dueAt.setDate(dueAt.getDate() + 1);
    }
    return dueAt;
  }

  private optionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private optionalNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
    return undefined;
  }
}
