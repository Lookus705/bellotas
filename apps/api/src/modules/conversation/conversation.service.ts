import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateSession(tenantId: string, userId: string) {
    const existing = await this.prisma.conversationSession.findFirst({
      where: { tenantId, userId, status: "ACTIVE" }
    });

    if (existing) return existing;

    return this.prisma.conversationSession.create({
      data: {
        tenantId,
        userId,
        channel: "telegram",
        status: "ACTIVE",
        contextJson: {}
      }
    });
  }

  async saveInboundMessage(params: {
    tenantId: string;
    sessionId: string;
    userId?: string;
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

  async saveOutboundMessage(params: { tenantId: string; sessionId: string; userId?: string; text: string }) {
    return this.prisma.conversationMessage.create({
      data: {
        tenantId: params.tenantId,
        sessionId: params.sessionId,
        userId: params.userId,
        direction: "outbound",
        messageType: "system",
        rawText: params.text
      }
    });
  }
}
