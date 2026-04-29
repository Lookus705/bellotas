import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  OperationalNoteType,
  Prisma,
  UserRole,
  WorkAssignmentStatus,
  WorkItemEventType,
  WorkItemStatus,
  WorkType
} from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AiService } from "../ai/ai.service";

type CreateWorkItemPayload = {
  workType: WorkType;
  title: string;
  summary?: string;
  accountId?: string;
  contactPersonId?: string;
  assignedUserId?: string;
  targetAt?: string;
  metadata?: Record<string, unknown>;
  deliveryChannel?: string;
  deliveryProvider?: string;
};

type AssignWorkItemPayload = {
  assignedUserId: string;
  targetAt?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  deliveryChannel?: string;
  deliveryProvider?: string;
};

type WorkItemSyncPayload = {
  tenantId: string;
  userId: string;
  actorUserId?: string;
  workTypes: WorkType[];
  nextStatus: "acknowledged" | "completed";
  details: string;
  eventType: WorkItemEventType;
  hints?: {
    vehicleLabel?: string;
    orderRef?: string;
    routeRef?: string;
  };
};

type CurrentAssignedWorkResolution =
  | { status: "none" }
  | { status: "ambiguous"; items: Array<{ id: string; title: string; workType: WorkType }> }
  | {
      status: "single";
      workItem: {
        id: string;
        status: WorkItemStatus;
        title: string;
      };
    };

@Injectable()
export class WorkItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly aiService: AiService
  ) {}

  async getContextOptions(tenantId: string) {
    const [employees, accounts] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          tenantId,
          status: "ACTIVE",
          roles: {
            none: {
              role: UserRole.admin
            }
          }
        },
        include: { roles: true },
        orderBy: { fullName: "asc" }
      }),
      this.prisma.commercialAccount.findMany({
        where: { tenantId },
        include: {
          people: {
            orderBy: { fullName: "asc" }
          }
        },
        orderBy: { name: "asc" }
      })
    ]);

    return {
      employees,
      accounts
    };
  }

  async getAssignedWorkContextForUser(tenantId: string, userId: string) {
    return this.prisma.workItem.findMany({
      where: {
        tenantId,
        assignedUserId: userId,
        status: {
          in: [WorkItemStatus.assigned, WorkItemStatus.acknowledged]
        }
      },
      include: {
        account: true,
        contactPerson: true,
        notes: {
          where: {
            type: {
              in: [
                OperationalNoteType.work_note,
                OperationalNoteType.person_preference,
                OperationalNoteType.account_rule
              ]
            }
          },
          orderBy: { createdAt: "desc" },
          take: 6
        }
      },
      orderBy: [{ targetAt: "asc" }, { createdAt: "desc" }]
    });
  }

  async buildAssignedWorkSummary(tenantId: string, userId: string) {
    const items = await this.getAssignedWorkContextForUser(tenantId, userId);
    if (items.length === 0) {
      return "No tienes trabajos asignados pendientes.";
    }

    const topItems = items.slice(0, 3);
    const lines = topItems.map((item, index) => {
      const parts = [
        `${index + 1}. ${this.workTypeLabel(item.workType)}: ${item.title}`,
        item.account?.name ? `cuenta ${item.account.name}` : null,
        item.contactPerson?.fullName ? `persona ${item.contactPerson.fullName}` : null,
        item.summary ? `resumen ${item.summary}` : null,
        item.targetAt ? `fecha ${item.targetAt.toLocaleString("es-DO")}` : null,
        item.notes.length > 0
          ? `notas ${item.notes
              .map((note) => note.summary || note.title || note.content)
              .filter(Boolean)
              .slice(0, 2)
              .join(" | ")}`
          : null
      ].filter(Boolean);

      return parts
        .join(", ")
        .replace(/[.;,\s]+$/g, "");
    });

    const extra = items.length > topItems.length ? ` Tienes ${items.length} trabajos activos.` : "";
    return `Tus trabajos asignados: ${lines.join(" ; ")}.${extra}`;
  }

  async buildAssignedWorkDetail(tenantId: string, userId: string) {
    const items = await this.getAssignedWorkContextForUser(tenantId, userId);
    if (items.length === 0) {
      return "No tienes trabajos asignados pendientes.";
    }
    if (items.length > 1) {
      const labels = items
        .slice(0, 3)
        .map((item, index) => `${index + 1}. ${this.workTypeLabel(item.workType)} ${item.title}`)
        .join(" ; ");
      return `Tienes varios trabajos activos. Primero consulta el resumen para identificarlo: ${labels}.`;
    }

    const workItem = items[0];
    const lines = [
      `Detalle del trabajo actual: ${workItem.title}`,
      `Tipo ${this.workTypeLabel(workItem.workType)}`,
      workItem.account?.name ? `cuenta ${workItem.account.name}` : null,
      workItem.contactPerson?.fullName ? `persona ${workItem.contactPerson.fullName}` : null,
      workItem.summary ? `resumen ${workItem.summary}` : null,
      workItem.targetAt ? `fecha ${workItem.targetAt.toLocaleString("es-DO")}` : null,
      workItem.deliveryMessage ? workItem.deliveryMessage : null,
      workItem.notes.length > 0
        ? `notas clave ${workItem.notes
            .map((note) => note.summary || note.title || note.content)
            .filter(Boolean)
            .slice(0, 4)
            .join(" | ")}`
        : null
    ].filter(Boolean);

    const extra =
      items.length > 1 ? ` Tienes ${items.length - 1} trabajos adicionales pendientes.` : "";

    return `${lines.join(". ").replace(/[.;,\s]+$/g, "")}.${extra}`;
  }

  async acknowledgeCurrentAssignedWorkItem(tenantId: string, userId: string, actorUserId?: string) {
    return this.transitionCurrentAssignedWorkItem({
      tenantId,
      userId,
      actorUserId,
      nextStatus: WorkItemStatus.acknowledged,
      details: "Trabajo marcado como recibido por conversacion",
      eventType: WorkItemEventType.updated
    });
  }

  async completeCurrentAssignedWorkItem(tenantId: string, userId: string, actorUserId?: string) {
    return this.transitionCurrentAssignedWorkItem({
      tenantId,
      userId,
      actorUserId,
      nextStatus: WorkItemStatus.completed,
      details: "Trabajo marcado como completado por conversacion",
      eventType: WorkItemEventType.completed
    });
  }

  async listWorkItems(
    tenantId: string,
    filters: {
      status?: string;
      workType?: WorkType;
      assignedUserId?: string;
    }
  ) {
    return this.prisma.workItem.findMany({
      where: {
        tenantId,
        ...(filters.status ? { status: filters.status as WorkItemStatus } : {}),
        ...(filters.workType ? { workType: filters.workType } : {}),
        ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {})
      },
      include: {
        account: true,
        contactPerson: true,
        assignedUser: {
          include: {
            roles: true
          }
        },
        notes: {
          orderBy: { createdAt: "desc" },
          take: 6
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 6
        }
      },
      orderBy: [{ targetAt: "asc" }, { createdAt: "desc" }]
    });
  }

  async getWorkItemDetail(tenantId: string, workItemId: string) {
    const workItem = await this.prisma.workItem.findFirst({
      where: { id: workItemId, tenantId },
      include: {
        account: true,
        contactPerson: true,
        assignedUser: {
          include: { roles: true }
        },
        createdBy: true,
        assignments: {
          include: {
            assignedUser: {
              include: { roles: true }
            },
            assignedBy: true
          },
          orderBy: { assignedAt: "desc" }
        },
        notes: {
          include: {
            createdBy: true,
            decidedBy: true
          },
          orderBy: { createdAt: "desc" }
        },
        events: {
          include: {
            actor: true
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!workItem) {
      throw new NotFoundException("Trabajo no encontrado");
    }

    return workItem;
  }

  async createWorkItem(tenantId: string, actorUserId: string, payload: CreateWorkItemPayload) {
    if (!payload.title?.trim()) {
      throw new BadRequestException("El trabajo necesita un titulo");
    }

    await this.ensureContextBelongsToTenant(tenantId, payload.accountId, payload.contactPersonId);
    await this.ensureAssignableUser(tenantId, payload.assignedUserId);

    const targetAt = this.parseOptionalDate(payload.targetAt);

    const workItem = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workItem.create({
        data: {
          tenantId,
          workType: payload.workType,
          status: payload.assignedUserId ? WorkItemStatus.assigned : WorkItemStatus.draft,
          title: payload.title.trim(),
          summary: this.optionalString(payload.summary),
          accountId: payload.accountId,
          contactPersonId: payload.contactPersonId,
          assignedUserId: payload.assignedUserId,
          createdByUserId: actorUserId,
          targetAt,
          metadataJson: this.asJsonInput(payload.metadata),
          deliveryChannel: this.optionalString(payload.deliveryChannel),
          deliveryProvider: this.optionalString(payload.deliveryProvider)
        }
      });

      if (payload.assignedUserId) {
        await tx.workAssignment.create({
          data: {
            tenantId,
            workItemId: created.id,
            assignedUserId: payload.assignedUserId,
            assignedByUserId: actorUserId
          }
        });
      }

      await tx.workItemEvent.create({
        data: {
          tenantId,
          workItemId: created.id,
          actorUserId,
          eventType: payload.assignedUserId ? WorkItemEventType.assigned : WorkItemEventType.created,
          details: payload.assignedUserId ? "Trabajo creado y asignado" : "Trabajo creado",
          metaJson: this.asJsonInput(payload.metadata)
        }
      });

      const preview = await this.composeDeliveryMessage(tx, created.id);
      await tx.workItem.update({
        where: { id: created.id },
        data: {
          deliveryMessage: preview
        }
      });

      return created;
    });

    await this.auditService.log({
      tenantId,
      actorUserId,
      action: "work_item.created",
      targetType: "work_item",
      targetId: workItem.id,
      meta: {
        workType: payload.workType,
        assignedUserId: payload.assignedUserId ?? null
      }
    });

    return this.getWorkItemDetail(tenantId, workItem.id);
  }

  async assignWorkItem(
    tenantId: string,
    actorUserId: string,
    workItemId: string,
    payload: AssignWorkItemPayload
  ) {
    const workItem = await this.prisma.workItem.findFirst({
      where: { id: workItemId, tenantId }
    });

    if (!workItem) {
      throw new NotFoundException("Trabajo no encontrado");
    }

    await this.ensureAssignableUser(tenantId, payload.assignedUserId);
    const targetAt = this.parseOptionalDate(payload.targetAt);

    await this.prisma.$transaction(async (tx) => {
      const activeAssignments = await tx.workAssignment.findMany({
        where: {
          tenantId,
          workItemId,
            status: WorkAssignmentStatus.active
          }
        });

      for (const assignment of activeAssignments) {
        await tx.workAssignment.update({
          where: { id: assignment.id },
          data: {
            status:
              assignment.assignedUserId === payload.assignedUserId
                ? WorkAssignmentStatus.active
                : WorkAssignmentStatus.reassigned,
            endedAt:
              assignment.assignedUserId === payload.assignedUserId ? assignment.endedAt : new Date()
          }
        });
      }

      const alreadyActive = activeAssignments.some(
        (assignment) => assignment.assignedUserId === payload.assignedUserId
      );

      if (!alreadyActive) {
        await tx.workAssignment.create({
          data: {
            tenantId,
            workItemId,
            assignedUserId: payload.assignedUserId,
            assignedByUserId: actorUserId,
            metadataJson: this.asJsonInput(payload.metadata)
          }
        });
      }

      await tx.workItem.update({
        where: { id: workItemId },
        data: {
          assignedUserId: payload.assignedUserId,
          status:
            workItem.status === WorkItemStatus.completed || workItem.status === WorkItemStatus.cancelled
              ? workItem.status
              : WorkItemStatus.assigned,
          summary: this.optionalString(payload.summary) ?? workItem.summary,
          targetAt: targetAt ?? workItem.targetAt,
          metadataJson:
            payload.metadata !== undefined
              ? this.asJsonInput(payload.metadata)
              : workItem.metadataJson ?? Prisma.JsonNull,
          deliveryChannel: this.optionalString(payload.deliveryChannel) ?? workItem.deliveryChannel,
          deliveryProvider: this.optionalString(payload.deliveryProvider) ?? workItem.deliveryProvider
        }
      });

      await tx.workItemEvent.create({
        data: {
          tenantId,
          workItemId,
          actorUserId,
          eventType: activeAssignments.length > 0 ? WorkItemEventType.reassigned : WorkItemEventType.assigned,
          details: activeAssignments.length > 0 ? "Trabajo reasignado" : "Trabajo asignado",
          metaJson: {
            assignedUserId: payload.assignedUserId
          }
        }
      });

      const preview = await this.composeDeliveryMessage(tx, workItemId);
      await tx.workItem.update({
        where: { id: workItemId },
        data: {
          deliveryMessage: preview
        }
      });
    });

    await this.auditService.log({
      tenantId,
      actorUserId,
      action: "work_item.assigned",
      targetType: "work_item",
      targetId: workItemId,
      meta: {
        assignedUserId: payload.assignedUserId
      }
    });

    return this.getWorkItemDetail(tenantId, workItemId);
  }

  async addWorkItemNote(
    tenantId: string,
    actorUserId: string,
    workItemId: string,
    payload: {
      content: string;
      title?: string;
      type?: OperationalNoteType;
      sourceMessageId?: string;
    }
  ) {
    const workItem = await this.prisma.workItem.findFirst({
      where: { id: workItemId, tenantId }
    });

    if (!workItem) {
      throw new NotFoundException("Trabajo no encontrado");
    }

    if (!payload.content?.trim()) {
      throw new BadRequestException("La nota no puede estar vacia");
    }

    const suggestion = payload.type
      ? null
      : await this.aiService.proposeOperationalMemory(tenantId, payload.content);
    const type = payload.type ?? suggestion?.suggestedType ?? OperationalNoteType.provisional_observation;

    const note = await this.prisma.operationalNote.create({
      data: {
        tenantId,
        type,
        title: this.optionalString(payload.title),
        content: payload.content.trim(),
        summary: suggestion?.summary,
        workItemId,
        createdByUserId: actorUserId,
        sourceMessageId: payload.sourceMessageId,
        proposedByAi: Boolean(suggestion),
        confidence: suggestion?.confidence
      }
    });

    await this.prisma.workItemEvent.create({
      data: {
        tenantId,
        workItemId,
        actorUserId,
        eventType: WorkItemEventType.note_added,
        details: "Nota operativa anadida",
        metaJson: {
          noteId: note.id,
          type
        }
      }
    });

    const preview = await this.composeDeliveryMessage(this.prisma, workItemId);
    await this.prisma.workItem.update({
      where: { id: workItemId },
      data: {
        deliveryMessage: preview
      }
    });

    await this.auditService.log({
      tenantId,
      actorUserId,
      action: "work_item.note_added",
      targetType: "work_item",
      targetId: workItemId,
      meta: {
        noteId: note.id,
        type
      }
    });

    return this.getWorkItemDetail(tenantId, workItemId);
  }

  async promoteNoteToMemory(
    tenantId: string,
    actorUserId: string,
    workItemId: string,
    noteId: string,
    payload: {
      type?: OperationalNoteType;
      target?: "work_item" | "account" | "person";
      title?: string;
      summary?: string;
    }
  ) {
    const note = await this.prisma.operationalNote.findFirst({
      where: {
        id: noteId,
        tenantId,
        workItemId
      },
      include: {
        workItem: true
      }
    });

    if (!note || !note.workItem) {
      throw new NotFoundException("Nota no encontrada");
    }

    const target = payload.target ?? this.defaultPromotionTarget(note.type, note.workItem);
    const finalType = payload.type ?? this.defaultPromotionType(target, note.type);

    const contactPersonId =
      target === "person"
        ? note.workItem.contactPersonId
        : finalType === OperationalNoteType.person_preference
          ? note.contactPersonId ?? note.workItem.contactPersonId
          : null;
    const accountId =
      target === "account"
        ? note.workItem.accountId
        : finalType === OperationalNoteType.account_rule
          ? note.accountId ?? note.workItem.accountId
          : null;

    if (target === "person" && !contactPersonId) {
      throw new BadRequestException("Este trabajo no tiene una persona asociada");
    }
    if (target === "account" && !accountId) {
      throw new BadRequestException("Este trabajo no tiene una cuenta asociada");
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.operationalNote.update({
        where: { id: noteId },
        data: {
          type: finalType,
          title: this.optionalString(payload.title) ?? note.title,
          summary: this.optionalString(payload.summary) ?? note.summary,
          accountId: accountId ?? null,
          contactPersonId: contactPersonId ?? null,
          decidedByUserId: actorUserId
        }
      });

      if (accountId) {
        const account = await tx.commercialAccount.findUnique({ where: { id: accountId } });
        if (account) {
          await tx.commercialAccount.update({
            where: { id: accountId },
            data: {
              commercialMemory: this.appendLegacyMemory(account.commercialMemory, updated)
            }
          });
        }
      }

      if (contactPersonId) {
        const person = await tx.contactPerson.findUnique({ where: { id: contactPersonId } });
        if (person) {
          await tx.contactPerson.update({
            where: { id: contactPersonId },
            data: {
              personalMemory: this.appendLegacyMemory(person.personalMemory, updated)
            }
          });
        }
      }

      await tx.workItemEvent.create({
        data: {
          tenantId,
          workItemId,
          actorUserId,
          eventType: WorkItemEventType.note_promoted,
          details: "Nota promovida a memoria util",
          metaJson: {
            noteId,
            target,
            type: finalType
          }
        }
      });
    });

    await this.auditService.log({
      tenantId,
      actorUserId,
      action: "work_item.note_promoted",
      targetType: "work_item",
      targetId: workItemId,
      meta: {
        noteId,
        target,
        type: finalType
      }
    });

    return this.getWorkItemDetail(tenantId, workItemId);
  }

  async captureMessageMemoryProposal(params: {
    tenantId: string;
    sourceMessageId: string;
    content: string;
    accountId?: string | null;
    contactPersonId?: string | null;
  }) {
    const suggestion = await this.aiService.proposeOperationalMemory(params.tenantId, params.content);
    if (!suggestion || suggestion.confidence < 0.7) {
      return null;
    }

    return this.prisma.operationalNote.create({
      data: {
        tenantId: params.tenantId,
        type: OperationalNoteType.provisional_observation,
        content: params.content.trim(),
        summary: suggestion.summary,
        accountId:
          suggestion.target === "account" || suggestion.target === "person"
            ? params.accountId ?? undefined
            : undefined,
        contactPersonId: suggestion.target === "person" ? params.contactPersonId ?? undefined : undefined,
        sourceMessageId: params.sourceMessageId,
        proposedByAi: true,
        confidence: suggestion.confidence,
        metadataJson: {
          suggestedType: suggestion.suggestedType,
          suggestedTarget: suggestion.target
        }
      }
    });
  }

  async captureEmployeeMemoryFromConversation(params: {
    tenantId: string;
    userId: string;
    content: string;
    sourceMessageId?: string;
  }) {
    const suggestion = await this.aiService.proposeOperationalMemory(params.tenantId, params.content);
    if (!suggestion || suggestion.confidence < 0.62) {
      return null;
    }

    const items = await this.getAssignedWorkContextForUser(params.tenantId, params.userId);
    if (items.length === 0) {
      return null;
    }

    const workItem = items[0];
    if (items.length > 1) {
      const sameAccount = items.every((item) => item.accountId && item.accountId === workItem.accountId);
      const samePerson = items.every(
        (item) => item.contactPersonId && item.contactPersonId === workItem.contactPersonId
      );

      if (
        (suggestion.target === "account" && !sameAccount) ||
        (suggestion.target === "person" && !samePerson) ||
        suggestion.target === "work_item"
      ) {
        return {
          ambiguous: true,
          items: items.slice(0, 3).map((item) => ({
            id: item.id,
            title: item.title,
            workType: item.workType
          }))
        };
      }
    }

    const targetAccountId =
      suggestion.target === "account" || suggestion.target === "person"
        ? workItem.accountId ?? undefined
        : undefined;
    const targetPersonId = suggestion.target === "person" ? workItem.contactPersonId ?? undefined : undefined;

    const note = await this.prisma.operationalNote.create({
      data: {
        tenantId: params.tenantId,
        type: suggestion.suggestedType,
        content: params.content.trim(),
        summary: suggestion.summary,
        workItemId: workItem.id,
        accountId: targetAccountId,
        contactPersonId: targetPersonId,
        sourceMessageId: params.sourceMessageId,
        proposedByAi: true,
        confidence: suggestion.confidence,
        metadataJson: {
          suggestedType: suggestion.suggestedType,
          suggestedTarget: suggestion.target,
          source: "employee_conversation"
        }
      }
    });

    await this.prisma.workItemEvent.create({
      data: {
        tenantId: params.tenantId,
        workItemId: workItem.id,
        actorUserId: params.userId,
        eventType: WorkItemEventType.note_added,
        details: "Nota operativa capturada desde conversacion",
        metaJson: this.asJsonInput({
          noteId: note.id,
          type: suggestion.suggestedType,
          target: suggestion.target
        })
      }
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.userId,
      action: "work_item.note_captured_from_conversation",
      targetType: "work_item",
      targetId: workItem.id,
      meta: {
        noteId: note.id,
        type: suggestion.suggestedType,
        target: suggestion.target
      }
    });

    return {
      note,
      workItem,
      suggestion
    };
  }

  async acknowledgeAssignedWorkItem(params: Omit<WorkItemSyncPayload, "nextStatus" | "eventType">) {
    return this.syncOperationalProgress({
      ...params,
      nextStatus: WorkItemStatus.acknowledged,
      eventType: WorkItemEventType.updated
    });
  }

  async completeAssignedWorkItem(params: Omit<WorkItemSyncPayload, "nextStatus" | "eventType">) {
    return this.syncOperationalProgress({
      ...params,
      nextStatus: WorkItemStatus.completed,
      eventType: WorkItemEventType.completed
    });
  }

  private async ensureContextBelongsToTenant(
    tenantId: string,
    accountId?: string,
    contactPersonId?: string
  ) {
    if (accountId) {
      const account = await this.prisma.commercialAccount.findFirst({
        where: { id: accountId, tenantId }
      });
      if (!account) {
        throw new BadRequestException("La cuenta comercial no existe en este tenant");
      }
    }

    if (contactPersonId) {
      const person = await this.prisma.contactPerson.findFirst({
        where: { id: contactPersonId, tenantId }
      });
      if (!person) {
        throw new BadRequestException("La persona de contacto no existe en este tenant");
      }
      if (accountId && person.accountId !== accountId) {
        throw new BadRequestException("La persona no pertenece a la cuenta indicada");
      }
    }
  }

  private async ensureAssignableUser(tenantId: string, assignedUserId?: string) {
    if (!assignedUserId) {
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: assignedUserId, tenantId },
      include: { roles: true }
    });

    if (!user) {
      throw new BadRequestException("El empleado asignado no existe");
    }

    if (user.status !== "ACTIVE") {
      throw new BadRequestException("Solo puedes asignar trabajo a empleados activos");
    }

    if (user.roles.some((role) => role.role === UserRole.admin)) {
      throw new BadRequestException("No se asignan trabajos operativos a usuarios admin");
    }
  }

  private async composeDeliveryMessage(
    db: Prisma.TransactionClient | PrismaService,
    workItemId: string
  ) {
    const workItem = await db.workItem.findUnique({
      where: { id: workItemId },
      include: {
        account: true,
        contactPerson: true,
        assignedUser: true,
        notes: {
          where: {
            type: {
              in: [
                OperationalNoteType.work_note,
                OperationalNoteType.person_preference,
                OperationalNoteType.account_rule
              ]
            }
          },
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });

    if (!workItem) {
      return null;
    }

    const lines = [
      `Trabajo: ${workItem.title}`,
      workItem.summary ? `Resumen: ${workItem.summary}` : null,
      `Tipo: ${workItem.workType}`,
      workItem.account?.name ? `Cuenta: ${workItem.account.name}` : null,
      workItem.contactPerson?.fullName ? `Persona: ${workItem.contactPerson.fullName}` : null,
      workItem.targetAt ? `Fecha objetivo: ${workItem.targetAt.toLocaleString("es-DO")}` : null,
      workItem.notes.length > 0
        ? `Notas clave: ${workItem.notes
            .map((note) => note.summary || note.title || note.content)
            .filter(Boolean)
            .join(" | ")}`
        : null
    ].filter(Boolean);

    return lines.join(". ");
  }

  private async syncOperationalProgress(params: WorkItemSyncPayload) {
    const workItem = await this.findRelevantAssignedWorkItem(params);
    if (!workItem) {
      return null;
    }

    if (params.nextStatus === WorkItemStatus.acknowledged && workItem.status !== WorkItemStatus.assigned) {
      return workItem;
    }
    if (params.nextStatus === WorkItemStatus.completed && workItem.status === WorkItemStatus.completed) {
      return workItem;
    }
    if (workItem.status === WorkItemStatus.cancelled) {
      return workItem;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id: workItem.id },
        data: {
          status: params.nextStatus
        }
      });

      const activeAssignment = await tx.workAssignment.findFirst({
        where: {
          tenantId: params.tenantId,
          workItemId: workItem.id,
          assignedUserId: params.userId,
          status: WorkAssignmentStatus.active
        },
        orderBy: { assignedAt: "desc" }
      });

      if (activeAssignment) {
        await tx.workAssignment.update({
          where: { id: activeAssignment.id },
          data: {
            acknowledgedAt:
              params.nextStatus === WorkItemStatus.acknowledged && !activeAssignment.acknowledgedAt
                ? new Date()
                : activeAssignment.acknowledgedAt,
            status:
              params.nextStatus === WorkItemStatus.completed
                ? WorkAssignmentStatus.completed
                : activeAssignment.status,
            endedAt:
              params.nextStatus === WorkItemStatus.completed ? new Date() : activeAssignment.endedAt
          }
        });
      }

      await tx.workItemEvent.create({
        data: {
          tenantId: params.tenantId,
          workItemId: workItem.id,
          actorUserId: params.actorUserId ?? params.userId,
          eventType: params.eventType,
          details: params.details,
          metaJson: this.asJsonInput({
            hints: params.hints ?? null,
            nextStatus: params.nextStatus
          })
        }
      });
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId ?? params.userId,
      action:
        params.nextStatus === WorkItemStatus.completed
          ? "work_item.completed_from_operation"
          : "work_item.acknowledged_from_operation",
      targetType: "work_item",
      targetId: workItem.id,
      meta: {
        workTypes: params.workTypes,
        hints: params.hints ?? null
      }
    });

    return this.getWorkItemDetail(params.tenantId, workItem.id);
  }

  private async transitionCurrentAssignedWorkItem(params: {
    tenantId: string;
    userId: string;
    actorUserId?: string;
    nextStatus: "acknowledged" | "completed";
    details: string;
    eventType: WorkItemEventType;
  }) {
    const resolution = await this.resolveCurrentAssignedWorkItem(
      params.tenantId,
      params.userId,
      params.nextStatus === WorkItemStatus.completed
        ? [WorkItemStatus.assigned, WorkItemStatus.acknowledged]
        : [WorkItemStatus.assigned, WorkItemStatus.acknowledged]
    );

    if (resolution.status === "none") {
      return null;
    }
    if (resolution.status === "ambiguous") {
      return {
        ambiguous: true,
        items: resolution.items
      };
    }

    const workItem = resolution.workItem;

    if (params.nextStatus === WorkItemStatus.acknowledged && workItem.status === WorkItemStatus.acknowledged) {
      return {
        workItem: await this.getWorkItemDetail(params.tenantId, workItem.id),
        changed: false,
        previousStatus: workItem.status
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id: workItem.id },
        data: {
          status: params.nextStatus
        }
      });

      const activeAssignment = await tx.workAssignment.findFirst({
        where: {
          tenantId: params.tenantId,
          workItemId: workItem.id,
          assignedUserId: params.userId,
          status: WorkAssignmentStatus.active
        },
        orderBy: { assignedAt: "desc" }
      });

      if (activeAssignment) {
        await tx.workAssignment.update({
          where: { id: activeAssignment.id },
          data: {
            acknowledgedAt:
              params.nextStatus === WorkItemStatus.acknowledged && !activeAssignment.acknowledgedAt
                ? new Date()
                : activeAssignment.acknowledgedAt,
            status:
              params.nextStatus === WorkItemStatus.completed
                ? WorkAssignmentStatus.completed
                : activeAssignment.status,
            endedAt:
              params.nextStatus === WorkItemStatus.completed ? new Date() : activeAssignment.endedAt
          }
        });
      }

      await tx.workItemEvent.create({
        data: {
          tenantId: params.tenantId,
          workItemId: workItem.id,
          actorUserId: params.actorUserId ?? params.userId,
          eventType: params.eventType,
          details: params.details,
          metaJson: this.asJsonInput({
            nextStatus: params.nextStatus,
            source: "conversation"
          })
        }
      });
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId ?? params.userId,
      action:
        params.nextStatus === WorkItemStatus.completed
          ? "work_item.completed_from_conversation"
          : "work_item.acknowledged_from_conversation",
      targetType: "work_item",
      targetId: workItem.id
    });

    return {
      workItem: await this.getWorkItemDetail(params.tenantId, workItem.id),
      changed: workItem.status !== params.nextStatus,
      previousStatus: workItem.status
    };
  }

  private async resolveCurrentAssignedWorkItem(
    tenantId: string,
    userId: string,
    statuses: WorkItemStatus[]
  ): Promise<CurrentAssignedWorkResolution> {
    const items = await this.prisma.workItem.findMany({
      where: {
        tenantId,
        assignedUserId: userId,
        status: {
          in: statuses
        }
      },
      select: {
        id: true,
        status: true,
        title: true,
        workType: true
      },
      orderBy: [{ targetAt: "asc" }, { createdAt: "desc" }]
    });

    if (items.length === 0) {
      return { status: "none" };
    }

    if (items.length > 1) {
      return {
        status: "ambiguous",
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          workType: item.workType
        }))
      };
    }

    return {
      status: "single",
      workItem: items[0]
    };
  }

  private async findRelevantAssignedWorkItem(params: WorkItemSyncPayload) {
    const candidates = await this.prisma.workItem.findMany({
      where: {
        tenantId: params.tenantId,
        assignedUserId: params.userId,
        workType: {
          in: params.workTypes
        },
        status: {
          in:
            params.nextStatus === WorkItemStatus.completed
              ? [WorkItemStatus.assigned, WorkItemStatus.acknowledged]
              : [WorkItemStatus.assigned]
        }
      },
      orderBy: [{ targetAt: "asc" }, { createdAt: "desc" }]
    });

    if (candidates.length === 0) {
      return null;
    }

    const hinted = candidates.filter((candidate) =>
      this.matchesOperationalHints(candidate.metadataJson, params.hints)
    );

    if (hinted.length === 1) {
      return hinted[0];
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    return null;
  }

  private matchesOperationalHints(
    metadata: Prisma.JsonValue | null,
    hints?: WorkItemSyncPayload["hints"]
  ) {
    if (!hints) {
      return false;
    }

    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return false;
    }

    const record = metadata as Record<string, Prisma.JsonValue>;
    const checks = [
      hints.vehicleLabel
        ? this.jsonStringEquals(record.vehicleLabel, hints.vehicleLabel)
        : null,
      hints.orderRef ? this.jsonStringEquals(record.orderRef, hints.orderRef) : null,
      hints.routeRef ? this.jsonStringEquals(record.routeRef, hints.routeRef) : null
    ].filter((value): value is boolean => value !== null);

    return checks.length > 0 && checks.every(Boolean);
  }

  private jsonStringEquals(value: Prisma.JsonValue | undefined, expected: string) {
    return typeof value === "string" && value.trim().toLowerCase() === expected.trim().toLowerCase();
  }

  private workTypeLabel(workType: WorkType) {
    const labels: Record<WorkType, string> = {
      route: "Ruta",
      order: "Pedido",
      appointment: "Cita",
      visit: "Visita",
      task: "Tarea"
    };

    return labels[workType] ?? "Trabajo";
  }

  private appendLegacyMemory(memory: Prisma.JsonValue | null, note: {
    id: string;
    type: OperationalNoteType;
    title: string | null;
    summary: string | null;
    content: string;
    createdAt: Date;
  }) {
    const current =
      memory && typeof memory === "object" && !Array.isArray(memory)
        ? (memory as Record<string, Prisma.JsonValue>)
        : {};
    const notes = Array.isArray(current.notes) ? [...current.notes] : [];
    notes.push({
      id: note.id,
      type: note.type,
      title: note.title,
      summary: note.summary,
      content: note.content,
      createdAt: note.createdAt.toISOString()
    });

    return {
      ...current,
      notes
    };
  }

  private defaultPromotionTarget(
    type: OperationalNoteType,
    workItem: { accountId: string | null; contactPersonId: string | null }
  ) {
    if (type === OperationalNoteType.person_preference && workItem.contactPersonId) {
      return "person" as const;
    }
    if (type === OperationalNoteType.account_rule && workItem.accountId) {
      return "account" as const;
    }
    if (workItem.contactPersonId) {
      return "person" as const;
    }
    if (workItem.accountId) {
      return "account" as const;
    }
    return "work_item" as const;
  }

  private defaultPromotionType(
    target: "work_item" | "account" | "person",
    currentType: OperationalNoteType
  ) {
    if (target === "person") {
      return OperationalNoteType.person_preference;
    }
    if (target === "account") {
      return OperationalNoteType.account_rule;
    }
    return currentType === OperationalNoteType.provisional_observation
      ? OperationalNoteType.work_note
      : currentType;
  }

  private optionalString(value?: string | null) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private parseOptionalDate(value?: string) {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Fecha objetivo invalida");
    }

    return parsed;
  }

  private asJsonInput(value?: Record<string, unknown> | null) {
    if (value === undefined || value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }
}
