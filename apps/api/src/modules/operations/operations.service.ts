import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AuditService } from "../audit/audit.service";
import { IncidentsService } from "../incidents/incidents.service";

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly incidentsService: IncidentsService
  ) {}

  async startDriverRoute(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    vehicleLabel: string;
    odometer: number;
  }) {
    const route = await this.prisma.driverRoute.create({
      data: {
        tenantId: params.tenantId,
        driverUserId: params.userId,
        vehicleLabel: params.vehicleLabel,
        status: "started",
        startOdometer: params.odometer,
        startedAt: new Date(),
        sourceSessionId: params.sessionId
      }
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.userId,
      action: "driver.route.started",
      targetType: "driver_route",
      targetId: route.id
    });

    return route;
  }

  async closeDriverRoute(params: { tenantId: string; userId: string; odometer: number; invoices?: string[] }) {
    const route = await this.prisma.driverRoute.findFirst({
      where: { tenantId: params.tenantId, driverUserId: params.userId, status: "started" },
      orderBy: { startedAt: "desc" }
    });
    if (!route) throw new NotFoundException("No hay ruta iniciada");

    const updated = await this.prisma.driverRoute.update({
      where: { id: route.id },
      data: {
        status: "closed",
        endOdometer: params.odometer,
        closedAt: new Date()
      }
    });

    if (params.invoices?.length) {
      await this.prisma.driverInvoice.createMany({
        data: params.invoices.map((invoice) => ({
          tenantId: params.tenantId,
          routeId: route.id,
          invoiceNumber: invoice
        }))
      });
    }

    return updated;
  }

  async registerDriverInvoices(params: { tenantId: string; userId: string; invoices: string[] }) {
    const route = await this.prisma.driverRoute.findFirst({
      where: { tenantId: params.tenantId, driverUserId: params.userId, status: "started" },
      orderBy: { startedAt: "desc" }
    });
    if (!route) throw new NotFoundException("No hay ruta activa");

    await this.prisma.driverInvoice.createMany({
      data: params.invoices.map((invoice) => ({
        tenantId: params.tenantId,
        routeId: route.id,
        invoiceNumber: invoice
      }))
    });

    return { ok: true, routeId: route.id };
  }

  async registerDriverIncident(params: {
    tenantId: string;
    userId: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high" | "critical";
    incidentType: string;
  }) {
    const route = await this.prisma.driverRoute.findFirst({
      where: { tenantId: params.tenantId, driverUserId: params.userId, status: "started" },
      orderBy: { startedAt: "desc" }
    });

    return this.incidentsService.createIncident({
      tenantId: params.tenantId,
      reportedByUserId: params.userId,
      sourceType: "driver",
      relatedRouteId: route?.id,
      title: params.title,
      description: params.description,
      severity: params.severity,
      incidentType: params.incidentType
    });
  }

  async createWarehousePicking(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    orderRef: string;
    routeRef?: string;
    vehicleLabel?: string;
    notes?: string;
  }) {
    return this.prisma.warehousePicking.create({
      data: {
        tenantId: params.tenantId,
        workerUserId: params.userId,
        orderRef: params.orderRef,
        routeRef: params.routeRef,
        vehicleLabel: params.vehicleLabel,
        pickedAt: new Date(),
        notes: params.notes,
        sourceSessionId: params.sessionId
      }
    });
  }

  async createTruckLoading(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    vehicleLabel: string;
    boxCount?: number;
    weightKg?: number;
    notes?: string;
  }) {
    return this.prisma.truckLoading.create({
      data: {
        tenantId: params.tenantId,
        workerUserId: params.userId,
        vehicleLabel: params.vehicleLabel,
        boxCount: params.boxCount,
        weightKg: params.weightKg,
        loadedAt: new Date(),
        notes: params.notes,
        sourceSessionId: params.sessionId
      }
    });
  }

  async registerWarehouseIncident(params: {
    tenantId: string;
    userId: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high" | "critical";
    incidentType: string;
  }) {
    return this.incidentsService.createIncident({
      tenantId: params.tenantId,
      reportedByUserId: params.userId,
      sourceType: "warehouse",
      title: params.title,
      description: params.description,
      severity: params.severity,
      incidentType: params.incidentType
    });
  }
}
