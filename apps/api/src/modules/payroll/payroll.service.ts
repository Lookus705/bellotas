import { Injectable, NotFoundException } from "@nestjs/common";
import { FileKind } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService
  ) {}

  async uploadPayroll(params: {
    tenantId: string;
    uploadedByUserId: string;
    employeeCode: string;
    periodYear: number;
    periodMonth: number;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  }) {
    const employee = await this.prisma.user.findUnique({
      where: {
        tenantId_employeeCode: {
          tenantId: params.tenantId,
          employeeCode: params.employeeCode
        }
      }
    });
    if (!employee) throw new NotFoundException("Empleado no encontrado");

    const file = await this.storageService.saveFile({
      tenantId: params.tenantId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      buffer: params.buffer,
      fileKind: FileKind.payroll_pdf,
      createdByUserId: params.uploadedByUserId
    });

    const payroll = await this.prisma.payrollDocument.upsert({
      where: {
        tenantId_employeeUserId_periodYear_periodMonth: {
          tenantId: params.tenantId,
          employeeUserId: employee.id,
          periodYear: params.periodYear,
          periodMonth: params.periodMonth
        }
      },
      update: {
        fileId: file.id,
        uploadedByUserId: params.uploadedByUserId
      },
      create: {
        tenantId: params.tenantId,
        employeeUserId: employee.id,
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        fileId: file.id,
        uploadedByUserId: params.uploadedByUserId
      }
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.uploadedByUserId,
      action: "payroll.uploaded",
      targetType: "payroll_document",
      targetId: payroll.id
    });

    return payroll;
  }

  async listPayrolls(tenantId: string) {
    return this.prisma.payrollDocument.findMany({
      where: { tenantId },
      include: { employee: true },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { createdAt: "desc" }]
    });
  }

  async getLatestPayrollForEmployee(tenantId: string, userId: string) {
    const payroll = await this.prisma.payrollDocument.findFirst({
      where: { tenantId, employeeUserId: userId },
      include: { file: true },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { createdAt: "desc" }]
    });
    if (!payroll) return null;

    const stored = await this.storageService.getFileBuffer(tenantId, payroll.fileId);

    return {
      payroll,
      buffer: stored.buffer
    };
  }

  async dispatchPayrolls(params: {
    tenantId: string;
    actorUserId: string;
    periodYear: number;
    periodMonth: number;
    payrollIds?: string[];
  }) {
    const validation = await this.validatePayrollDispatch(params);
    const validIds = new Set(
      validation.results
        .filter((item) => item.status === "valid")
        .map((item) => item.payrollId)
    );
    const payrolls = await this.prisma.payrollDocument.findMany({
      where: {
        tenantId: params.tenantId,
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        ...(params.payrollIds?.length ? { id: { in: params.payrollIds } } : {})
      },
      include: {
        employee: true,
        file: true
      }
    });

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: params.tenantId }
    });
    const botToken = settings?.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN;

    const results: Array<{
      employeeCode: string;
      fullName: string;
      status: "sent" | "skipped";
      reason?: string;
    }> = [];

    for (const payroll of payrolls) {
      const link = await this.prisma.telegramLink.findFirst({
        where: {
          tenantId: params.tenantId,
          userId: payroll.employeeUserId,
          revokedAt: null
        }
      });

      if (!validIds.has(payroll.id)) {
        const validationResult = validation.results.find((item) => item.payrollId === payroll.id);
        results.push({
          employeeCode: payroll.employee.employeeCode,
          fullName: payroll.employee.fullName,
          status: "skipped",
          reason: validationResult?.reason ?? "validation_failed"
        });
        continue;
      }

      const stored = await this.storageService.getFileBuffer(params.tenantId, payroll.fileId);
      await this.sendTelegramDocument({
        botToken: botToken ?? "",
        chatId: link?.telegramChatId ?? "",
        buffer: stored.buffer,
        fileName: payroll.file.originalName,
        caption: `Nomina ${payroll.periodMonth}/${payroll.periodYear}`
      });

      results.push({
        employeeCode: payroll.employee.employeeCode,
        fullName: payroll.employee.fullName,
        status: "sent"
      });
    }

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: "payroll.dispatched",
      targetType: "payroll_batch",
      targetId: `${params.periodYear}-${params.periodMonth}`,
      meta: {
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        total: payrolls.length,
        sent: results.filter((item) => item.status === "sent").length,
        skipped: results.filter((item) => item.status === "skipped").length
      }
    });

    return {
      periodYear: params.periodYear,
      periodMonth: params.periodMonth,
      total: payrolls.length,
      sent: results.filter((item) => item.status === "sent").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      results
    };
  }

  async validatePayrollDispatch(params: {
    tenantId: string;
    periodYear: number;
    periodMonth: number;
    payrollIds?: string[];
  }) {
    const payrolls = await this.prisma.payrollDocument.findMany({
      where: {
        tenantId: params.tenantId,
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        ...(params.payrollIds?.length ? { id: { in: params.payrollIds } } : {})
      },
      include: {
        employee: true,
        file: true
      }
    });

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: params.tenantId }
    });
    const botToken = settings?.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN;

    const results: Array<{
      payrollId: string;
      employeeCode: string;
      fullName: string;
      status: "valid" | "blocked";
      reason?: string;
    }> = [];

    for (const payroll of payrolls) {
      if (!payroll.employee) {
        results.push({
          payrollId: payroll.id,
          employeeCode: "desconocido",
          fullName: "Empleado desconocido",
          status: "blocked",
          reason: "employee_not_found"
        });
        continue;
      }

      if (payroll.employee.status !== "ACTIVE") {
        results.push({
          payrollId: payroll.id,
          employeeCode: payroll.employee.employeeCode,
          fullName: payroll.employee.fullName,
          status: "blocked",
          reason: "employee_inactive"
        });
        continue;
      }

      if (!payroll.fileId) {
        results.push({
          payrollId: payroll.id,
          employeeCode: payroll.employee.employeeCode,
          fullName: payroll.employee.fullName,
          status: "blocked",
          reason: "missing_pdf"
        });
        continue;
      }

      if (!Number.isInteger(params.periodYear) || !Number.isInteger(params.periodMonth) || params.periodMonth < 1 || params.periodMonth > 12) {
        results.push({
          payrollId: payroll.id,
          employeeCode: payroll.employee.employeeCode,
          fullName: payroll.employee.fullName,
          status: "blocked",
          reason: "invalid_period"
        });
        continue;
      }

      if (!botToken) {
        results.push({
          payrollId: payroll.id,
          employeeCode: payroll.employee.employeeCode,
          fullName: payroll.employee.fullName,
          status: "blocked",
          reason: "telegram_bot_not_configured"
        });
        continue;
      }

      const link = await this.prisma.telegramLink.findFirst({
        where: {
          tenantId: params.tenantId,
          userId: payroll.employeeUserId,
          revokedAt: null
        }
      });

      if (!link?.telegramChatId) {
        results.push({
          payrollId: payroll.id,
          employeeCode: payroll.employee.employeeCode,
          fullName: payroll.employee.fullName,
          status: "blocked",
          reason: "employee_not_linked_to_telegram"
        });
        continue;
      }

      results.push({
        payrollId: payroll.id,
        employeeCode: payroll.employee.employeeCode,
        fullName: payroll.employee.fullName,
        status: "valid"
      });
    }

    return {
      periodYear: params.periodYear,
      periodMonth: params.periodMonth,
      totalSelected: payrolls.length,
      validCount: results.filter((item) => item.status === "valid").length,
      blockedCount: results.filter((item) => item.status === "blocked").length,
      results
    };
  }

  private async sendTelegramDocument(params: {
    botToken: string;
    chatId: string;
    buffer: Buffer;
    fileName: string;
    caption: string;
  }) {
    const formData = new FormData();
    formData.append("chat_id", params.chatId);
    formData.append("caption", params.caption);
    formData.append(
      "document",
      new Blob([new Uint8Array(params.buffer)], { type: "application/pdf" }),
      params.fileName
    );

    await fetch(`${process.env.TELEGRAM_API_BASE}/bot${params.botToken}/sendDocument`, {
      method: "POST",
      body: formData
    });
  }
}
