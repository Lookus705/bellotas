import { Injectable } from "@nestjs/common";
import { FileKind } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConversationService } from "../conversation/conversation.service";
import { StorageService } from "../storage/storage.service";
import { WorkItemsService } from "../work-items/work-items.service";
import { CanonicalIngressSupportService } from "./canonical-ingress.support";
import { CanonicalIntegrationAuthContext, CustomerMessagePayload } from "./canonical-ingress.types";

@Injectable()
export class CustomerMessagesService {
  constructor(
    private readonly support: CanonicalIngressSupportService,
    private readonly conversationService: ConversationService,
    private readonly auditService: AuditService,
    private readonly workItemsService: WorkItemsService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService
  ) {}

  async ingest(
    auth: CanonicalIntegrationAuthContext,
    idempotencyKey: string,
    body: CustomerMessagePayload
  ) {
    this.support.ensureScope(auth, "customer_messages");
    this.support.ensureIdempotencyKey(idempotencyKey);

    return this.support.executeIdempotent(auth, "customer_message", idempotencyKey, body, async () => {
      const identity = await this.support.resolveCommercialIdentity({
        tenantId: auth.tenantId,
        channel: body.channel,
        provider: body.provider,
        endpointExternalId: body.endpointExternalId,
        accountHints: body.accountHints,
        personHints: body.personHints,
        messageText: body.message.text ?? body.message.body
      });

      const session = await this.conversationService.getOrCreateExternalSession({
        tenantId: auth.tenantId,
        channel: body.channel,
        accountId: identity.account.id,
        contactPersonId: identity.person?.id,
        channelEndpointId: identity.endpoint.id
      });

      const message = await this.conversationService.saveInboundMessage({
        tenantId: auth.tenantId,
        sessionId: session.id,
        accountId: identity.account.id,
        contactPersonId: identity.person?.id,
        channelEndpointId: identity.endpoint.id,
        messageType: "text",
        rawText: body.message.text ?? body.message.body ?? body.message.subject
      });

      await this.workItemsService.captureMessageMemoryProposal({
        tenantId: auth.tenantId,
        sourceMessageId: message.id,
        content: body.message.text ?? body.message.body ?? body.message.subject ?? "",
        accountId: identity.account.id,
        contactPersonId: identity.person?.id
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
              sourceType: "customer_message",
              sourceChannel: body.channel,
              sourceProvider: body.provider,
              externalEventId: body.externalEventId,
              area: "empresa",
              category: "incoming_attachment",
              title: attachment.fileName,
              description: "Adjunto recibido desde customer-messages",
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
            fileId: file.id,
            documentId: document.id,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType
          };
        })
      );

      await this.auditService.log({
        tenantId: auth.tenantId,
        action: "customer_message.received",
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
        account: {
          id: identity.account.id,
          name: identity.account.name,
          externalRef: identity.account.externalRef
        },
        endpoint: {
          id: identity.endpoint.id,
          channel: identity.endpoint.channel,
          provider: identity.endpoint.provider,
          endpointExternalId: identity.endpoint.endpointExternalId
        },
        currentPerson: identity.person
          ? {
              id: identity.person.id,
              fullName: identity.person.fullName,
              alias: identity.person.alias
            }
          : null,
        attachments: savedAttachments.map((attachment) => ({
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          documentId: attachment.documentId
        })),
        assistantMessage: "Mensaje recibido y contexto comercial actualizado."
      };
    });
  }
}
