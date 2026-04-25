import { Injectable } from "@nestjs/common";
import { ReminderStatus, ReminderType } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async createReminder(params: {
    tenantId: string;
    userId: string;
    createdByUserId: string;
    type: ReminderType;
    title: string;
    dueAt: Date;
  }) {
    const reminder = await this.prisma.reminder.create({
      data: params
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.createdByUserId,
      action: "reminder.created",
      targetType: "reminder",
      targetId: reminder.id
    });

    return reminder;
  }

  async listPendingForUser(tenantId: string, userId: string) {
    return this.prisma.reminder.findMany({
      where: {
        tenantId,
        userId,
        status: ReminderStatus.pending
      },
      orderBy: { dueAt: "asc" },
      take: 20
    });
  }

  async listDuePendingForUser(tenantId: string, userId: string) {
    return this.prisma.reminder.findMany({
      where: {
        tenantId,
        userId,
        status: ReminderStatus.pending,
        dueAt: {
          lte: new Date()
        }
      },
      orderBy: { dueAt: "asc" },
      take: 20
    });
  }

  async cancelReminder(tenantId: string, userId: string, reminderId: string) {
    return this.prisma.reminder.updateMany({
      where: {
        id: reminderId,
        tenantId,
        userId,
        status: ReminderStatus.pending
      },
      data: {
        status: ReminderStatus.cancelled,
        cancelledAt: new Date()
      }
    });
  }

  async markDelivered(tenantId: string, reminderId: string) {
    return this.prisma.reminder.updateMany({
      where: {
        id: reminderId,
        tenantId,
        status: ReminderStatus.pending
      },
      data: {
        status: ReminderStatus.delivered,
        deliveredAt: new Date()
      }
    });
  }
}
