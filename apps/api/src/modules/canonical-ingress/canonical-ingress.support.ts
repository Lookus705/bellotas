import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { createHash } from "crypto";
import { PrismaService } from "../../common/prisma.service";
import { CanonicalIntegrationAuthContext } from "./canonical-ingress.types";

@Injectable()
export class CanonicalIngressSupportService {
  constructor(private readonly prisma: PrismaService) {}

  ensureScope(auth: CanonicalIntegrationAuthContext, ...allowedScopes: string[]) {
    if (!allowedScopes.some((scope) => auth.scopes.includes(scope))) {
      throw new ForbiddenException(
        `Integration scopes ${allowedScopes.join(", ")} not allowed`
      );
    }
  }

  ensureIdempotencyKey(value?: string) {
    if (!value) {
      throw new BadRequestException("Missing x-idempotency-key");
    }
  }

  async executeIdempotent<T>(
    auth: CanonicalIntegrationAuthContext,
    operation: string,
    idempotencyKey: string,
    payload: unknown,
    handler: () => Promise<T>
  ): Promise<T & { idempotentReplay?: boolean }> {
    const requestHash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");

    const existing = await this.prisma.integrationRequest.findUnique({
      where: {
        tenantId_operation_idempotencyKey: {
          tenantId: auth.tenantId,
          operation,
          idempotencyKey
        }
      }
    });

    if (existing?.completedAt) {
      if (existing.requestHash !== requestHash) {
        throw new BadRequestException("Idempotency key reused with different payload");
      }

      return {
        ...(existing.responseJson as Prisma.JsonObject as T),
        idempotentReplay: true
      };
    }

    const request =
      existing ??
      (await this.prisma.integrationRequest.create({
        data: {
          tenantId: auth.tenantId,
          integrationApiKeyId: auth.integrationId,
          operation,
          idempotencyKey,
          requestHash
        }
      }));

    const result = await handler();

    await this.prisma.integrationRequest.update({
      where: { id: request.id },
      data: {
        responseJson: result as Prisma.InputJsonValue,
        completedAt: new Date()
      }
    });

    return result as T & { idempotentReplay?: boolean };
  }

  async findEmployee(tenantId: string, employeeCode: string, allowedRoles?: UserRole[]) {
    const user = await this.prisma.user.findUnique({
      where: {
        tenantId_employeeCode: {
          tenantId,
          employeeCode
        }
      },
      include: { roles: true }
    });

    if (!user) {
      throw new NotFoundException("Employee not found");
    }

    if (allowedRoles?.length) {
      const roleSet = new Set(user.roles.map((role) => role.role));
      if (!allowedRoles.some((role) => roleSet.has(role))) {
        throw new ForbiddenException("Employee role is not allowed for this operation");
      }
    }

    return user;
  }

  async upsertUserChannelEndpoint(params: {
    tenantId: string;
    userId: string;
    channel: string;
    provider: string;
    endpointExternalId: string;
    label?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const lastSeenAt = new Date();

    return this.prisma.channelEndpoint.upsert({
      where: {
        tenantId_channel_provider_endpointExternalId: {
          tenantId: params.tenantId,
          channel: params.channel,
          provider: params.provider,
          endpointExternalId: params.endpointExternalId
        }
      },
      update: {
        userId: params.userId,
        revokedAt: null,
        lastSeenAt,
        ...(params.label !== undefined ? { label: params.label } : {}),
        ...(params.metadata !== undefined ? { metadataJson: params.metadata } : {})
      },
      create: {
        tenantId: params.tenantId,
        userId: params.userId,
        channel: params.channel,
        provider: params.provider,
        endpointExternalId: params.endpointExternalId,
        label: params.label,
        metadataJson: params.metadata,
        lastSeenAt
      }
    });
  }

  async resolveCommercialIdentity(params: {
    tenantId: string;
    channel: string;
    provider: string;
    endpointExternalId: string;
    accountHints?: { externalRef?: string; name?: string };
    personHints?: { fullName?: string; alias?: string };
    messageText?: string;
  }) {
    const endpointKey = {
      tenantId_channel_provider_endpointExternalId: {
        tenantId: params.tenantId,
        channel: params.channel,
        provider: params.provider,
        endpointExternalId: params.endpointExternalId
      }
    };

    let endpoint = await this.prisma.channelEndpoint.findUnique({
      where: endpointKey,
      include: {
        account: true,
        currentPerson: true
      }
    });

    if (!endpoint) {
      endpoint = await this.prisma.channelEndpoint.create({
        data: {
          tenantId: params.tenantId,
          channel: params.channel,
          provider: params.provider,
          endpointExternalId: params.endpointExternalId,
          label: params.accountHints?.name ?? params.endpointExternalId,
          lastSeenAt: new Date()
        },
        include: {
          account: true,
          currentPerson: true
        }
      });
    }

    let account = endpoint.account;
    if (!account) {
      account =
        (params.accountHints?.externalRef
          ? await this.prisma.commercialAccount.findUnique({
              where: {
                tenantId_externalRef: {
                  tenantId: params.tenantId,
                  externalRef: params.accountHints.externalRef
                }
              }
            })
          : null) ??
        (params.accountHints?.name
          ? await this.prisma.commercialAccount.findFirst({
              where: {
                tenantId: params.tenantId,
                name: params.accountHints.name
              }
            })
          : null);

      if (!account) {
        account = await this.prisma.commercialAccount.create({
          data: {
            tenantId: params.tenantId,
            externalRef: params.accountHints?.externalRef,
            name: params.accountHints?.name ?? endpoint.label ?? params.endpointExternalId
          }
        });
      }
    }

    const declaredName =
      params.personHints?.fullName ??
      this.extractDeclaredPersonName(params.messageText ?? "") ??
      endpoint.currentPerson?.fullName ??
      null;

    let person =
      endpoint.currentPerson && (!declaredName || endpoint.currentPerson.fullName === declaredName)
        ? endpoint.currentPerson
        : null;

    if (!person && declaredName) {
      person =
        (await this.prisma.contactPerson.findFirst({
          where: {
            tenantId: params.tenantId,
            accountId: account.id,
            fullName: declaredName
          }
        })) ??
        (await this.prisma.contactPerson.create({
          data: {
            tenantId: params.tenantId,
            accountId: account.id,
            fullName: declaredName,
            alias: params.personHints?.alias
          }
        }));
    }

    endpoint = await this.prisma.channelEndpoint.update({
      where: { id: endpoint.id },
      data: {
        accountId: account.id,
        currentPersonId: person?.id,
        lastSeenAt: new Date(),
        revokedAt: null
      },
      include: {
        account: true,
        currentPerson: true
      }
    });

    return {
      account,
      endpoint,
      person
    };
  }

  private extractDeclaredPersonName(messageText: string) {
    const normalized = messageText.trim();
    const explicit = normalized.match(
      /(?:ya no soy\s+.+?\s*,?\s*soy|soy)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+){0,2}?)(?=\s+y\s+|\s+pero\s+|[,.]|$)/i
    );
    const raw = explicit?.[1]?.trim();
    if (!raw) {
      return null;
    }
    return raw.split(/\s+y\s+|\s+pero\s+|[,.]/i)[0]?.trim() ?? null;
  }
}
