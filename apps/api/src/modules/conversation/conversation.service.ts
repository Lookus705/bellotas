import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateSession(tenantId: string, userId: string, channel = "telegram") {
    return this.withSerializableRetry((tx) =>
      this.getOrCreateSessionInTransaction(tx, {
        tenantId,
        userId,
        channel
      })
    );
  }

  async getOrCreateExternalSession(params: {
    tenantId: string;
    channel: string;
    accountId?: string;
    contactPersonId?: string;
    channelEndpointId?: string;
  }) {
    return this.withSerializableRetry((tx) =>
      this.getOrCreateExternalSessionInTransaction(tx, params)
    );
  }

  async saveInboundMessage(params: {
    tenantId: string;
    sessionId: string;
    userId?: string;
    accountId?: string;
    contactPersonId?: string;
    channelEndpointId?: string;
    messageType: "text" | "audio" | "document";
    rawText?: string;
    transcriptText?: string;
    intent?: string;
    confidence?: number;
    entities?: Record<string, unknown>;
  }) {
    return this.prisma.conversationMessage.create({
      data: {
        tenantId: params.tenantId,
        sessionId: params.sessionId,
        userId: params.userId,
        accountId: params.accountId,
        contactPersonId: params.contactPersonId,
        channelEndpointId: params.channelEndpointId,
        direction: "inbound",
        messageType: params.messageType,
        rawText: params.rawText,
        transcriptText: params.transcriptText,
        intent: params.intent,
        intentConfidence: params.confidence,
        entitiesJson: (params.entities ?? {}) as Prisma.InputJsonValue
      }
    });
  }

  async saveOutboundMessage(params: {
    tenantId: string;
    sessionId: string;
    userId?: string;
    accountId?: string;
    contactPersonId?: string;
    channelEndpointId?: string;
    text: string;
  }) {
    return this.prisma.conversationMessage.create({
      data: {
        tenantId: params.tenantId,
        sessionId: params.sessionId,
        userId: params.userId,
        accountId: params.accountId,
        contactPersonId: params.contactPersonId,
        channelEndpointId: params.channelEndpointId,
        direction: "outbound",
        messageType: "system",
        rawText: params.text
      }
    });
  }

  async updateSessionContext(sessionId: string, context: Record<string, unknown>) {
    return this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        contextJson: context as Prisma.InputJsonValue
      }
    });
  }

  async clearSessionContext(sessionId: string) {
    return this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        contextJson: {}
      }
    });
  }

  private async withSerializableRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    attempts = 3
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => operation(tx),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable
          }
        );
      } catch (error) {
        lastError = error;
        if (!this.isRetryableTransactionError(error) || attempt === attempts - 1) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private async getOrCreateSessionInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      userId: string;
      channel: string;
    }
  ) {
    const existing = await tx.conversationSession.findFirst({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
        status: "ACTIVE",
        channel: params.channel
      }
    });

    if (existing) {
      return existing;
    }

    return tx.conversationSession.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        channel: params.channel,
        status: "ACTIVE",
        contextJson: {}
      }
    });
  }

  private async getOrCreateExternalSessionInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      channel: string;
      accountId?: string;
      contactPersonId?: string;
      channelEndpointId?: string;
    }
  ) {
    const existing = await tx.conversationSession.findFirst({
      where: {
        tenantId: params.tenantId,
        status: "ACTIVE",
        channel: params.channel,
        accountId: params.accountId ?? null,
        contactPersonId: params.contactPersonId ?? null,
        channelEndpointId: params.channelEndpointId ?? null,
        userId: null
      }
    });

    if (existing) {
      return existing;
    }

    return tx.conversationSession.create({
      data: {
        tenantId: params.tenantId,
        userId: null,
        accountId: params.accountId,
        contactPersonId: params.contactPersonId,
        channelEndpointId: params.channelEndpointId,
        channel: params.channel,
        status: "ACTIVE",
        contextJson: {}
      }
    });
  }

  private isRetryableTransactionError(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2034"
    );
  }
}
