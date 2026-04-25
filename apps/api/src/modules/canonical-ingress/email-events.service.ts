import { Injectable } from "@nestjs/common";
import { FileKind } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConversationService } from "../conversation/conversation.service";
import { StorageService } from "../storage/storage.service";
import { CanonicalIngressSupportService } from "./canonical-ingress.support";
import { CanonicalIntegrationAuthContext, EmailEventPayload } from "./canonical-ingress.types";

@Injectable()
export class EmailEventsService {
  constructor(
    private readonly support: CanonicalIngressSupportService,
    private readonly conversationService: ConversationService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService
  ) {}

  async ingest(
    auth: CanonicalIntegrationAuthContext,
    idempotencyKey: string,
    body: EmailEventPayload
  ) {
    this.support.ensureScope(auth, "email_events");
    this.support.ensureIdempotencyKey(idempotencyKey);

    return this.support.executeIdempotent(auth, "email_event", idempotencyKey, body, async () => {
      const identity = await this.support.resolveCommercialIdentity({
        tenantId: auth.tenantId,
        channel: body.channel,
        provider: body.provider,
        endpointExternalId: body.endpointExternalId,
        accountHints: body.accountHints,
        personHints: body.personHints,
        messageText: [body.subject, body.body].filter(Boolean).join(" ")
      });

      const session = await this.conversationService.getOrCreateExternalSession({
        tenantId: auth.tenantId,
        channel: body.channel,
        accountId: identity.account.id,
        contactPersonId: identity.person?.id,
        channelEndpointId: identity.endpoint.id
      });

      await this.conversationService.saveInboundMessage({
        tenantId: auth.tenantId,
        sessionId: session.id,
        accountId: identity.account.id,
        contactPersonId: identity.person?.id,
        channelEndpointId: identity.endpoint.id,
        messageType: "text",
        rawText: [body.subject, body.body].filter(Boolean).join("\n\n")
      });

      const savedAttachments = await Promise.all(
        (body.attachments ?? []).map(async (attachment) => {
          const buffer = Buffer.from(attachment.base64Content, "base64");
          const file = await this.storageService.saveFile({
            tenantId: auth.tenantId,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            buffer,
            fileKind: FileKind.document
          });

          const document = await this.prisma.tenantDocument.create({
            data: {
              tenantId: auth.tenantId,
              fileId: file.id,
              accountId: identity.account.id,
              channelEndpointId: identity.endpoint.id,
              sourceType: "email_event",
              sourceChannel: body.channel,
              sourceProvider: body.provider,
              externalEventId: body.externalEventId,
              area: "empresa",
              category: "incoming_attachment",
              title: attachment.fileName,
              description: "Adjunto recibido desde email-events",
              useForAi: false
            }
          });

          await this.conversationService.saveInboundMessage({
            tenantId: auth.tenantId,
            sessionId: session.id,
            accountId: identity.account.id,
            contactPersonId: identity.person?.id,
            channelEndpointId: identity.endpoint.id,
            messageType: "document",
            rawText: attachment.fileName
          });

          return {
            documentId: document.id,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType
          };
        })
      );

      await this.auditService.log({
        tenantId: auth.tenantId,
        action: "email_event.received",
        targetType: "commercial_account",
        targetId: identity.account.id,
        meta: {
          endpointId: identity.endpoint.id,
          contactPersonId: identity.person?.id ?? null,
          provider: body.provider,
          channel: body.channel,
          externalEventId: body.externalEventId ?? null,
          attachmentCount: savedAttachments.length
        }
      });

      return {
        accepted: true,
        accountId: identity.account.id,
        endpointId: identity.endpoint.id,
        currentPersonId: identity.person?.id ?? null,
        attachments: savedAttachments.map((attachment) => ({
          documentId: attachment.documentId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType
        })),
        assistantMessage: "Email recibido y normalizado en el core."
      };
    });
  }
}
