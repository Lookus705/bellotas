import { Injectable, NotFoundException } from "@nestjs/common";
import { IncidentStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class ManagerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async getOverview(tenantId: string) {
    const [tenant, settings, routesCount, pickingsCount, incidents, documentsCount] =
      await Promise.all([
        this.prisma.tenant.findUnique({ where: { id: tenantId } }),
        this.prisma.tenantSettings.findUnique({ where: { tenantId } }),
        this.prisma.driverRoute.count({ where: { tenantId } }),
        this.prisma.warehousePicking.count({ where: { tenantId } }),
        this.prisma.incident.findMany({
          where: { tenantId },
          select: { severity: true, status: true }
        }),
        this.prisma.tenantDocument.count({
          where: {
            tenantId,
            area: { in: ["manager", "company"] }
          }
        })
      ]);

    if (!tenant) {
      throw new NotFoundException("Tenant no encontrado");
    }

    return {
      companyName: settings?.companyName ?? tenant.name,
      businessProfile: settings?.businessProfile ?? "logistics",
      companyDescription: settings?.companyDescription ?? "",
      companyTimezone: settings?.companyTimezone ?? tenant.timezone,
      operationalHours: settings?.operationalHours ?? "",
      responsibleName: settings?.responsibleName ?? "",
      responsibleEmail: settings?.responsibleEmail ?? "",
      metrics: {
        routesCount,
        pickingsCount,
        openIncidents: incidents.filter((item) => item.status === "open").length,
        highSeverityIncidents: incidents.filter((item) =>
          ["high", "critical"].includes(item.severity)
        ).length,
        documentCount: documentsCount
      }
    };
  }

  async getOperationalConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true }
    });

    if (!tenant) {
      throw new NotFoundException("Tenant no encontrado");
    }

    return {
      companyName: tenant.settings?.companyName ?? tenant.name,
      businessProfile: tenant.settings?.businessProfile ?? "logistics",
      companyDescription: tenant.settings?.companyDescription ?? "",
      companyTimezone: tenant.settings?.companyTimezone ?? tenant.timezone,
      operationalHours: tenant.settings?.operationalHours ?? "",
      responsibleName: tenant.settings?.responsibleName ?? "",
      responsibleEmail: tenant.settings?.responsibleEmail ?? ""
    };
  }

  async updateOperationalConfig(
    tenantId: string,
    actorUserId: string,
    payload: {
      companyName?: string;
      companyDescription?: string;
      companyTimezone?: string;
      operationalHours?: string;
      responsibleName?: string;
      responsibleEmail?: string;
    }
  ) {
    const settings = await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: payload,
      create: {
        tenantId,
        ...payload
      }
    });

    await this.auditService.log({
      tenantId,
      actorUserId,
      action: "manager.operational_config.updated",
      targetType: "tenant_settings",
      targetId: settings.id
    });

    return settings;
  }

  async closeIncident(
    tenantId: string,
    actorUserId: string,
    incidentId: string,
    comment?: string
  ) {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, tenantId }
    });

    if (!incident) {
      throw new NotFoundException("Incidencia no encontrada");
    }

    const updated = await this.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: IncidentStatus.closed,
        closedAt: incident.closedAt ?? new Date()
      }
    });

    await this.auditService.log({
      tenantId,
      actorUserId,
      action: "manager.incident.closed",
      targetType: "incident",
      targetId: incidentId,
      meta: comment ? { comment } : undefined
    });

    return updated;
  }
}
