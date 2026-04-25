import { Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { CanonicalIngressSupportService } from "./canonical-ingress.support";
import { CanonicalIntegrationAuthContext, ErpEventPayload } from "./canonical-ingress.types";

@Injectable()
export class ErpEventsService {
  constructor(
    private readonly support: CanonicalIngressSupportService,
    private readonly auditService: AuditService
  ) {}

  async ingest(
    auth: CanonicalIntegrationAuthContext,
    idempotencyKey: string,
    body: ErpEventPayload
  ) {
    this.support.ensureScope(auth, "erp_events");
    this.support.ensureIdempotencyKey(idempotencyKey);

    return this.support.executeIdempotent(auth, "erp_event", idempotencyKey, body, async () => {
      const account = body.accountHints
        ? (
            await this.support.resolveCommercialIdentity({
              tenantId: auth.tenantId,
              channel: body.channel,
              provider: body.provider,
              endpointExternalId: `${body.entityType}:${body.externalId}`,
              accountHints: body.accountHints,
              messageText: JSON.stringify(body.payload)
            })
          ).account
        : null;

      await this.auditService.log({
        tenantId: auth.tenantId,
        action: "erp_event.received",
        targetType: body.entityType,
        targetId: account?.id ?? body.externalId,
        meta: {
          provider: body.provider,
          externalId: body.externalId,
          eventType: body.eventType,
          entityType: body.entityType,
          payload: body.payload
        }
      });

      return {
        accepted: true,
        entityType: body.entityType,
        eventType: body.eventType,
        externalId: body.externalId,
        accountId: account?.id ?? null,
        assistantMessage: "Evento ERP recibido y registrado en el core."
      };
    });
  }
}
