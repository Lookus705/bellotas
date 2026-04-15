import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async createIncident(params: {
    tenantId: string;
    reportedByUserId: string;
    sourceType: "driver" | "warehouse";
    relatedRouteId?: string;
    severity: "low" | "medium" | "high" | "critical";
    incidentType: string;
    title: string;
    description: string;
    detectedByAi?: boolean;
  }) {
    const incident = await this.prisma.incident.create({
      data: {
        tenantId: params.tenantId,
        reportedByUserId: params.reportedByUserId,
        sourceType: params.sourceType,
        relatedRouteId: params.relatedRouteId,
        severity: params.severity,
        incidentType: params.incidentType,
        title: params.title,
        description: params.description,
        detectedByAi: params.detectedByAi ?? true
      }
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.reportedByUserId,
      action: "incident.created",
      targetType: "incident",
      targetId: incident.id,
      meta: { severity: params.severity, incidentType: params.incidentType }
    });

    if (params.severity === "high" || params.severity === "critical") {
      await this.queueNotifications(incident.id, params.tenantId);
    }

    return incident;
  }

  async queueNotifications(incidentId: string, tenantId: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) return;

    const targets = await this.prisma.tenantAlertTarget.findMany({
      where: {
        tenantId,
        OR: [{ incidentType: null }, { incidentType: incident.incidentType }]
      }
    });

    for (const target of targets) {
      const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
      if (severityRank[incident.severity] < severityRank[target.severityMin]) continue;

      await this.prisma.incidentNotification.create({
        data: {
          tenantId,
          incidentId,
          channel: target.channel,
          recipient: target.targetValue,
          status: "pending"
        }
      });
    }
  }
}
