import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FileKind, Prisma, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "../storage/storage.service";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService
  ) {}

  async getSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true }
    });

    if (!tenant) {
      throw new NotFoundException("Tenant no encontrado");
    }

    if (tenant.settings) {
      return tenant.settings;
    }

    return this.prisma.tenantSettings.create({
      data: {
        tenantId,
        companyName: tenant.name,
        companyTimezone: tenant.timezone
      }
    });
  }

  async updateSettings(
    tenantId: string,
    actorUserId: string,
    payload: {
      companyName?: string;
      businessProfile?: string;
      companyDescription?: string;
      companyTimezone?: string;
      operationalHours?: string;
      responsibleName?: string;
      responsibleEmail?: string;
      telegramEnabled?: boolean;
      telegramBotToken?: string;
      emailProvider?: string;
      outboundEmailFrom?: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPassword?: string;
      aiProvider?: string;
      aiModel?: string;
      aiApiKey?: string;
      assistantInstructions?: string;
      operationalInstructions?: string;
      hrInstructions?: string;
      integrationNotes?: string;
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
      action: "settings.updated",
      targetType: "tenant_settings",
      targetId: settings.id
    });

    return settings;
  }

  async uploadDocument(params: {
    tenantId: string;
    uploadedByUserId: string;
    actorRoles: UserRole[];
    area: string;
    category: string;
    title: string;
    description?: string;
    useForAi?: boolean;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  }) {
    this.assertDocumentAccess(params.actorRoles, params.category);

    const file = await this.storageService.saveFile({
      tenantId: params.tenantId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      buffer: params.buffer,
      fileKind: FileKind.document,
      createdByUserId: params.uploadedByUserId
    });

    const extractedText = this.extractDocumentText(params.buffer, params.mimeType);

    const document = await this.prisma.tenantDocument.create({
      data: {
        tenantId: params.tenantId,
        fileId: file.id,
        uploadedByUserId: params.uploadedByUserId,
        area: params.area,
        category: params.category,
        title: params.title,
        description: params.description,
        useForAi: params.useForAi ?? false,
        extractedText
      },
      include: {
        uploadedBy: true,
        file: true
      }
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.uploadedByUserId,
      action: "document.uploaded",
      targetType: "tenant_document",
      targetId: document.id,
      meta: {
        area: params.area,
        category: params.category
      }
    });

    return document;
  }

  async createDocumentFromStoredFile(params: {
    tenantId: string;
    uploadedByUserId: string;
    actorRoles: UserRole[];
    area: string;
    category: string;
    title: string;
    description?: string;
    useForAi?: boolean;
    fileId: string;
  }) {
    this.assertDocumentAccess(params.actorRoles, params.category);

    const stored = await this.storageService.getFileBuffer(params.tenantId, params.fileId);
    const extractedText = this.extractDocumentText(stored.buffer, stored.file.mimeType);
    if (stored.file.fileKind !== FileKind.document) {
      await this.prisma.storedFile.update({
        where: { id: stored.file.id },
        data: { fileKind: FileKind.document }
      });
    }

    const document = await this.prisma.tenantDocument.create({
      data: {
        tenantId: params.tenantId,
        fileId: stored.file.id,
        uploadedByUserId: params.uploadedByUserId,
        area: params.area,
        category: params.category,
        title: params.title,
        description: params.description,
        useForAi: params.useForAi ?? false,
        extractedText
      },
      include: {
        uploadedBy: true,
        file: true
      }
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorUserId: params.uploadedByUserId,
      action: "document.uploaded",
      targetType: "tenant_document",
      targetId: document.id,
      meta: {
        area: params.area,
        category: params.category
      }
    });

    return document;
  }

  async listDocuments(tenantId: string, roles: UserRole[], area?: string) {
    const categories = this.allowedDocumentCategories(roles);
    return this.prisma.tenantDocument.findMany({
      where: {
        tenantId,
        category: { in: categories },
        ...(area ? { area } : {})
      },
      include: {
        uploadedBy: true,
        file: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async listDocumentsForAi(tenantId: string, area?: string) {
    return this.prisma.tenantDocument.findMany({
      where: {
        tenantId,
        useForAi: true,
        ...(area ? { area } : {})
      },
      include: { file: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async downloadDocument(tenantId: string, roles: UserRole[], documentId: string) {
    const document = await this.prisma.tenantDocument.findFirst({
      where: { id: documentId, tenantId },
      include: { file: true }
    });

    if (!document) {
      throw new NotFoundException("Documento no encontrado");
    }
    if (!this.allowedDocumentCategories(roles).includes(document.category)) {
      throw new ForbiddenException("No tienes acceso a este documento");
    }

    const stored = await this.storageService.getFileBuffer(tenantId, document.fileId);

    return {
      document,
      file: stored.file,
      buffer: stored.buffer
    };
  }

  private allowedDocumentCategories(roles: UserRole[]) {
    if (roles.includes(UserRole.admin)) {
      return ["operacion", "rrhh", "empresa", "manual", "politica"];
    }
    if (roles.includes(UserRole.manager)) {
      return ["operacion", "manual", "politica", "empresa"];
    }
    return ["rrhh", "politica", "empresa"];
  }

  private assertDocumentAccess(roles: UserRole[], category: string) {
    if (!this.allowedDocumentCategories(roles).includes(category)) {
      throw new ForbiddenException("No puedes subir documentos en esa categoria");
    }
  }

  private extractDocumentText(buffer: Buffer, mimeType: string) {
    const raw = buffer.toString("utf8");
    if (mimeType.includes("text")) {
      return raw.trim().slice(0, 20000);
    }

    const printable = raw.replace(/[^\x20-\x7E\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
    return printable.slice(0, 20000);
  }
}
