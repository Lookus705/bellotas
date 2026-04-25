import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "../storage/storage.service";
import { CanonicalIngressSupportService } from "./canonical-ingress.support";
import { CanonicalDocumentPayload, CanonicalIntegrationAuthContext } from "./canonical-ingress.types";

@Injectable()
export class DocumentsIngressService {
  constructor(
    private readonly support: CanonicalIngressSupportService,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService
  ) {}

  async ingest(
    auth: CanonicalIntegrationAuthContext,
    idempotencyKey: string,
    body: CanonicalDocumentPayload
  ) {
    this.support.ensureScope(auth, "documents");
    this.support.ensureIdempotencyKey(idempotencyKey);

    return this.support.executeIdempotent(auth, "document_ingress", idempotencyKey, body, async () => {
      let uploadedByUserId: string | undefined;
      let accountId: string | undefined;
      let channelEndpointId: string | undefined;

      if (body.employeeCode) {
        const user = await this.support.findEmployee(auth.tenantId, body.employeeCode);
        uploadedByUserId = user.id;
        if (body.endpointExternalId) {
          const endpoint = await this.support.upsertUserChannelEndpoint({
            tenantId: auth.tenantId,
            userId: user.id,
            channel: body.channel,
            provider: body.provider,
            endpointExternalId: body.endpointExternalId
          });
          channelEndpointId = endpoint.id;
        }
      } else if (body.endpointExternalId || body.accountHints) {
        const identity = await this.support.resolveCommercialIdentity({
          tenantId: auth.tenantId,
          channel: body.channel,
          provider: body.provider,
          endpointExternalId: body.endpointExternalId ?? `${body.provider}:${body.title}`,
          accountHints: body.accountHints,
          personHints: body.personHints,
          messageText: body.title
        });
        accountId = identity.account.id;
        channelEndpointId = identity.endpoint.id;
      }

      const buffer = Buffer.from(body.file.base64Content, "base64");
      const stored = await this.storageService.saveFile({
        tenantId: auth.tenantId,
        fileName: body.file.fileName,
        mimeType: body.file.mimeType,
        buffer,
        fileKind: "document",
        createdByUserId: uploadedByUserId
      });

      const extractedText = this.extractDocumentText(buffer, body.file.mimeType);

      const document = await this.prisma.tenantDocument.create({
        data: {
          tenantId: auth.tenantId,
          fileId: stored.id,
          uploadedByUserId,
          accountId,
          channelEndpointId,
          sourceType: body.sourceType,
          sourceChannel: body.channel,
          sourceProvider: body.provider,
          externalEventId: body.externalEventId,
          area: body.area,
          category: body.category,
          title: body.title,
          description: body.description,
          useForAi: body.useForAi ?? false,
          extractedText
        }
      });

      await this.auditService.log({
        tenantId: auth.tenantId,
        actorUserId: uploadedByUserId,
        action: "document.ingress",
        targetType: "tenant_document",
        targetId: document.id,
        meta: {
          accountId,
          channelEndpointId,
          sourceType: body.sourceType,
          channel: body.channel,
          provider: body.provider
        }
      });

      return {
        accepted: true,
        documentId: document.id,
        accountId: accountId ?? null,
        channelEndpointId: channelEndpointId ?? null
      };
    });
  }

  private extractDocumentText(buffer: Buffer, mimeType: string) {
    const raw = buffer.toString("utf8");
    if (mimeType.includes("text")) {
      return raw.trim().slice(0, 20000);
    }

    return raw.replace(/[^\x20-\x7E\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 20000);
  }
}
