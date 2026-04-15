import { Injectable, NotFoundException } from "@nestjs/common";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { FileKind } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class PayrollService {
  private readonly s3 = new S3Client({
    endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
    region: process.env.MINIO_REGION,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? ""
    },
    forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE ?? "true") === "true"
  });

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

    const object = await this.s3.send(
      new GetObjectCommand({
        Bucket: process.env.MINIO_BUCKET,
        Key: payroll.file.storageKey
      })
    );
    const bytes = await object.Body?.transformToByteArray();

    return {
      payroll,
      buffer: Buffer.from(bytes ?? [])
    };
  }
}
