import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { EmployeeEventsService } from "../canonical-ingress/employee-events.service";
import { WorkItemsService } from "../work-items/work-items.service";
import { IntegrationAuthContext } from "./integration-auth.types";

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeEventsService: EmployeeEventsService,
    private readonly workItemsService: WorkItemsService
  ) {}

  async driverCheckIn(
    auth: IntegrationAuthContext,
    idempotencyKey: string,
    body: {
      employeeCode: string;
      vehicleLabel: string;
      odometer: number;
      channel?: string;
    }
  ) {
    return this.employeeEventsService.ingest(auth, idempotencyKey, {
      channel: body.channel ?? "automation",
      provider: "legacy-integrations",
      employeeCode: body.employeeCode,
      eventType: "route.start",
      payload: {
        vehicleLabel: body.vehicleLabel,
        odometer: body.odometer
      }
    });
  }

  async driverCheckOut(
    auth: IntegrationAuthContext,
    idempotencyKey: string,
    body: {
      employeeCode: string;
      odometer: number;
      invoices?: string[];
    }
  ) {
    return this.employeeEventsService.ingest(auth, idempotencyKey, {
      channel: "automation",
      provider: "legacy-integrations",
      employeeCode: body.employeeCode,
      eventType: "route.end",
      payload: {
        odometer: body.odometer,
        invoices: body.invoices ?? []
      }
    });
  }

  async registerIncident(
    auth: IntegrationAuthContext,
    idempotencyKey: string,
    body: {
      employeeCode: string;
      sourceType: "driver" | "warehouse";
      incidentType: string;
      title: string;
      description: string;
      severity?: "low" | "medium" | "high" | "critical";
    }
  ) {
    return this.employeeEventsService.ingest(auth, idempotencyKey, {
      channel: "automation",
      provider: "legacy-integrations",
      employeeCode: body.employeeCode,
      eventType: "incident.report",
      payload: {
        sourceType: body.sourceType,
        incidentType: body.incidentType,
        title: body.title,
        description: body.description,
        severity: body.severity
      }
    });
  }

  async warehousePicking(
    auth: IntegrationAuthContext,
    idempotencyKey: string,
    body: {
      employeeCode: string;
      orderRef: string;
      routeRef?: string;
      vehicleLabel?: string;
      notes?: string;
      channel?: string;
    }
  ) {
    return this.employeeEventsService.ingest(auth, idempotencyKey, {
      channel: body.channel ?? "automation",
      provider: "legacy-integrations",
      employeeCode: body.employeeCode,
      eventType: "warehouse.picking",
      payload: {
        orderRef: body.orderRef,
        routeRef: body.routeRef,
        vehicleLabel: body.vehicleLabel,
        notes: body.notes
      }
    });
  }

  async warehouseLoading(
    auth: IntegrationAuthContext,
    idempotencyKey: string,
    body: {
      employeeCode: string;
      vehicleLabel: string;
      boxCount?: number;
      weightKg?: number;
      notes?: string;
      channel?: string;
    }
  ) {
    return this.employeeEventsService.ingest(auth, idempotencyKey, {
      channel: body.channel ?? "automation",
      provider: "legacy-integrations",
      employeeCode: body.employeeCode,
      eventType: "warehouse.loading",
      payload: {
        vehicleLabel: body.vehicleLabel,
        boxCount: body.boxCount,
        weightKg: body.weightKg,
        notes: body.notes
      }
    });
  }

  async payrollQuery(auth: IntegrationAuthContext, employeeCode: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        tenantId_employeeCode: {
          tenantId: auth.tenantId,
          employeeCode
        }
      }
    });

    if (!user) {
      throw new NotFoundException("Employee not found");
    }

    return this.employeeEventsService.ingest(auth, `payroll-${employeeCode}-latest`, {
      channel: "automation",
      provider: "legacy-integrations",
      employeeCode,
      eventType: "payroll.query",
      payload: {}
    });
  }

  async conversationMessage(
    auth: IntegrationAuthContext,
    idempotencyKey: string,
    body: {
      employeeCode: string;
      text: string;
      channel?: string;
    }
  ) {
    return this.employeeEventsService.ingest(auth, idempotencyKey, {
      channel: body.channel ?? "automation",
      provider: "legacy-integrations",
      employeeCode: body.employeeCode,
      eventType: "conversation.message",
      payload: { text: body.text }
    });
  }

  async conversationAudio(
    auth: IntegrationAuthContext,
    idempotencyKey: string,
    body: {
      employeeCode: string;
      base64Audio: string;
      channel?: string;
    }
  ) {
    return this.employeeEventsService.ingest(auth, idempotencyKey, {
      channel: body.channel ?? "automation",
      provider: "legacy-integrations",
      employeeCode: body.employeeCode,
      eventType: "conversation.audio",
      payload: { base64Audio: body.base64Audio }
    });
  }

  async getEmployee(auth: IntegrationAuthContext, employeeCode: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        tenantId_employeeCode: {
          tenantId: auth.tenantId,
          employeeCode
        }
      },
      include: { roles: true }
    });

    if (!user) {
      throw new NotFoundException("Employee not found");
    }

    const assignedWorkItems = await this.workItemsService.getAssignedWorkContextForUser(
      auth.tenantId,
      user.id
    );

    return {
      id: user.id,
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      roles: user.roles.map((role) => role.role),
      assignedWorkItems: assignedWorkItems.map((item) => ({
        id: item.id,
        workType: item.workType,
        status: item.status,
        title: item.title,
        summary: item.summary,
        targetAt: item.targetAt,
        deliveryMessage: item.deliveryMessage,
        account: item.account
          ? {
              id: item.account.id,
              name: item.account.name
            }
          : null,
        contactPerson: item.contactPerson
          ? {
              id: item.contactPerson.id,
              fullName: item.contactPerson.fullName
            }
          : null,
        notes: item.notes.map((note) => ({
          id: note.id,
          type: note.type,
          title: note.title,
          summary: note.summary,
          content: note.content
        }))
      }))
    };
  }
}
