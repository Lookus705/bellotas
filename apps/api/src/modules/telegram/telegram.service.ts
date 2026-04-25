import { Injectable } from "@nestjs/common";
import { FileKind, ReminderType, UserRole } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { ConversationService } from "../conversation/conversation.service";
import { AiService } from "../ai/ai.service";
import { StorageService } from "../storage/storage.service";
import { SettingsService } from "../settings/settings.service";
import { RemindersService } from "../reminders/reminders.service";
import { PrismaService } from "../../common/prisma.service";
import { EmployeeEventsService } from "../canonical-ingress/employee-events.service";

type ClassifiedResult = {
  intent: string;
  entities: Record<string, string | number>;
  confidence?: number;
};

type PendingUploadContext = {
  fileId: string;
  fileName: string;
  mimeType: string;
  roleArea: string;
};

type SessionContext = {
  pendingUpload?: PendingUploadContext;
  pendingEvidenceFileId?: string;
};

@Injectable()
export class TelegramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly conversationService: ConversationService,
    private readonly aiService: AiService,
    private readonly employeeEventsService: EmployeeEventsService,
    private readonly storageService: StorageService,
    private readonly settingsService: SettingsService,
    private readonly remindersService: RemindersService
  ) {}

  async handleWebhook(tenantSlug: string, payload: any) {
    const message = payload.message ?? payload.edited_message;
    if (!message) return { ok: true };

    const telegramUserId = String(message.from?.id);
    const telegramChatId = String(message.chat?.id);
    const text = message.text?.trim();

    if (text?.startsWith("/start")) {
      await this.sendMessage(
        tenantSlug,
        telegramChatId,
        "Bienvenido. Inicia sesion con: LOGIN CODIGO PIN"
      );
      return { ok: true };
    }

    if (text?.toUpperCase().startsWith("LOGIN ")) {
      const parts = text.split(/\s+/);
      if (parts.length < 3) {
        await this.sendMessage(tenantSlug, telegramChatId, "Formato invalido. Usa: LOGIN CODIGO PIN");
        return { ok: true };
      }

      const result = await this.authService.validateTelegramLogin(
        tenantSlug,
        parts[1],
        parts[2],
        telegramUserId,
        telegramChatId
      );

      if (result.user.mustChangePin) {
        await this.sendMessage(
          tenantSlug,
          telegramChatId,
          "PIN temporal validado. Envia tu nuevo PIN con: NUEVO PIN 123456"
        );
        return { ok: true };
      }

      await this.sendMessage(
        tenantSlug,
        telegramChatId,
        `Sesion vinculada para ${result.user.fullName}. Escribe tu operacion en lenguaje natural.`
      );
      return { ok: true };
    }

    const linkedUser = await this.authService.getTelegramUserByLink(tenantSlug, telegramUserId);
    if (!linkedUser) {
      await this.sendMessage(
        tenantSlug,
        telegramChatId,
        "No tienes una sesion vinculada. Usa: LOGIN CODIGO PIN"
      );
      return { ok: true };
    }

    if (linkedUser.user.mustChangePin) {
      const newPin = this.extractNewPin(text);
      if (!newPin) {
        await this.sendMessage(
          tenantSlug,
          telegramChatId,
          "Debes cambiar tu PIN antes de continuar. Envia: NUEVO PIN 123456"
        );
        return { ok: true };
      }

      await this.authService.changeTelegramPin({
        tenantSlug,
        telegramUserId,
        newPin
      });
      await this.sendMessage(
        linkedUser.tenant.id,
        telegramChatId,
        "PIN actualizado. Ya puedes seguir usando el asistente."
      );
      return { ok: true };
    }

    const session = await this.conversationService.getOrCreateSession(
      linkedUser.tenant.id,
      linkedUser.user.id
    );
    const sessionContext = (session.contextJson as SessionContext | null) ?? {};

    await this.deliverDueReminders(linkedUser.tenant.id, telegramChatId, linkedUser.user.id);

    const media = await this.extractMedia(
      message,
      linkedUser.tenant.id,
      linkedUser.user.id,
      linkedUser.tenant.id
    );

    if (sessionContext.pendingUpload && text) {
      const category = this.extractDocumentCategory(text);
      if (!category) {
        await this.sendMessage(
          tenantSlug,
          telegramChatId,
          "Necesito la categoria del documento: operacion, rrhh, empresa, manual o politica."
        );
        return { ok: true };
      }

      await this.finalizePendingDocumentUpload({
        tenantId: linkedUser.tenant.id,
        userId: linkedUser.user.id,
        roles: linkedUser.user.roles,
        category,
        pendingUpload: sessionContext.pendingUpload,
        title: text
      });
      await this.conversationService.clearSessionContext(session.id);
      await this.sendMessage(linkedUser.tenant.id, telegramChatId, "Documento guardado correctamente.");
      return { ok: true };
    }

    if (media && this.canUploadDocuments(linkedUser.user.roles)) {
      const caption = text ?? "";
      const category = this.extractDocumentCategory(caption);
      if (!category) {
        await this.conversationService.updateSessionContext(session.id, {
          ...sessionContext,
          pendingUpload: {
            fileId: media.fileId,
            fileName: media.fileName,
            mimeType: media.mimeType,
            roleArea: linkedUser.user.roles.includes(UserRole.rrhh) ? "rrhh" : "manager"
          }
        });
        await this.sendMessage(
          tenantSlug,
          telegramChatId,
          "Recibi el archivo. Indica la categoria: operacion, rrhh, empresa, manual o politica."
        );
        return { ok: true };
      }

      await this.finalizePendingDocumentUpload({
        tenantId: linkedUser.tenant.id,
        userId: linkedUser.user.id,
        roles: linkedUser.user.roles,
        category,
        pendingUpload: {
          fileId: media.fileId,
          fileName: media.fileName,
          mimeType: media.mimeType,
          roleArea: linkedUser.user.roles.includes(UserRole.rrhh) ? "rrhh" : "manager"
        },
        title: caption || media.fileName
      });
      await this.sendMessage(linkedUser.tenant.id, telegramChatId, "Documento guardado correctamente.");
      return { ok: true };
    }

    if (media) {
      await this.conversationService.updateSessionContext(session.id, {
        ...sessionContext,
        pendingEvidenceFileId: media.fileId
      });
      await this.sendMessage(
        tenantSlug,
        telegramChatId,
        "Evidencia recibida. La conservo asociada a esta conversacion."
      );
      return { ok: true };
    }

    const reminderResponse = await this.tryHandleReminder(
      linkedUser.tenant.id,
      telegramChatId,
      linkedUser.tenant.id,
      linkedUser.user.id,
      linkedUser.user.roles,
      text
    );
    if (reminderResponse) {
      await this.conversationService.saveOutboundMessage({
        tenantId: linkedUser.tenant.id,
        sessionId: session.id,
        userId: linkedUser.user.id,
        text: reminderResponse
      });
      return { ok: true };
    }

    let finalText = text;
    if (!finalText && message.voice) {
      const audioBuffer = await this.downloadTelegramFile(linkedUser.tenant.id, message.voice.file_id);
      const savedAudio = await this.storageService.saveFile({
        tenantId: linkedUser.tenant.id,
        fileName: `${message.voice.file_unique_id}.ogg`,
        mimeType: "audio/ogg",
        buffer: audioBuffer,
        fileKind: FileKind.audio,
        createdByUserId: linkedUser.user.id
      });
      await this.conversationService.updateSessionContext(session.id, {
        ...sessionContext,
        pendingEvidenceFileId: savedAudio.id
      });
      finalText = await this.aiService.transcribeAudio(linkedUser.tenant.id, audioBuffer);
    }

    if (!finalText) {
      await this.sendMessage(tenantSlug, telegramChatId, "No pude procesar el mensaje. Envia texto, audio, foto o documento.");
      return { ok: true };
    }

    const result = await this.employeeEventsService.processEvent({
      tenantId: linkedUser.tenant.id,
      integrationName: "telegram-legacy",
      body: {
        channel: "telegram",
        provider: "telegram",
        externalEventId: String(message.message_id ?? Date.now()),
        endpointExternalId: telegramUserId,
        employeeCode: linkedUser.user.employeeCode,
        eventType: "conversation.message",
        payload: {
          text: finalText
        }
      }
    });

    if (Array.isArray((result as { outboundDocuments?: Array<{ fileName: string; mimeType: string; caption: string; fileBase64: string }> }).outboundDocuments)) {
      for (const document of (result as { outboundDocuments: Array<{ fileName: string; mimeType: string; caption: string; fileBase64: string }> }).outboundDocuments) {
        await this.sendDocument(
          linkedUser.tenant.id,
          telegramChatId,
          Buffer.from(document.fileBase64, "base64"),
          document.fileName,
          document.caption
        );
      }
    }

    await this.sendMessage(linkedUser.tenant.id, telegramChatId, (result as { assistantMessage?: string }).assistantMessage ?? "Operacion procesada.");
    return { ok: true };
  }

  private extractNewPin(text?: string) {
    if (!text) return null;
    const normalized = text.toLowerCase();
    if (!normalized.includes("pin") && !/^\d{4,8}$/.test(text.trim())) {
      return null;
    }
    const match = text.match(/(\d{4,8})/);
    return match?.[1] ?? null;
  }

  private canUploadDocuments(roles: UserRole[]) {
    return roles.some(
      (role) => role === UserRole.manager || role === UserRole.rrhh || role === UserRole.admin
    );
  }

  private extractDocumentCategory(text?: string) {
    const normalized = text?.toLowerCase() ?? "";
    if (normalized.includes("operacion")) return "operacion";
    if (normalized.includes("rrhh")) return "rrhh";
    if (normalized.includes("empresa")) return "empresa";
    if (normalized.includes("manual")) return "manual";
    if (normalized.includes("politica")) return "politica";
    return null;
  }

  private async finalizePendingDocumentUpload(params: {
    tenantId: string;
    userId: string;
    roles: UserRole[];
    category: string;
    pendingUpload: PendingUploadContext;
    title: string;
  }) {
    const stored = await this.storageService.getFileBuffer(params.tenantId, params.pendingUpload.fileId);
    await this.settingsService.uploadDocument({
      tenantId: params.tenantId,
      uploadedByUserId: params.userId,
      actorRoles: params.roles,
      area: params.pendingUpload.roleArea,
      category: params.category,
      title: params.title.trim() || params.pendingUpload.fileName,
      description: `Subido por Telegram`,
      useForAi: false,
      fileName: stored.file.originalName,
      mimeType: stored.file.mimeType,
      buffer: stored.buffer
    });
  }

  private async tryHandleReminder(
    tenantRef: string,
    chatId: string,
    tenantId: string,
    userId: string,
    roles: UserRole[],
    text?: string
  ) {
    const normalized = text?.toLowerCase().trim() ?? "";
    if (!normalized) {
      return null;
    }

    if (normalized === "mis recordatorios" || normalized === "recordatorios") {
      const reminders = await this.remindersService.listPendingForUser(tenantId, userId);
      const message = reminders.length === 0
        ? "No tienes recordatorios pendientes."
        : `Recordatorios pendientes:\n${reminders.map((item) => `- ${item.title} (${item.id.slice(0, 6)})`).join("\n")}`;
      await this.sendMessage(tenantRef, chatId, message);
      return message;
    }

    const cancelMatch = normalized.match(/cancelar recordatorio\s+([a-z0-9]+)/i);
    if (cancelMatch) {
      await this.remindersService.cancelReminder(tenantId, userId, cancelMatch[1]);
      const message = "Recordatorio cancelado si estaba pendiente.";
      await this.sendMessage(tenantRef, chatId, message);
      return message;
    }

    if (!normalized.startsWith("recordar ") && !normalized.startsWith("recordatorio ")) {
      return null;
    }

    const title = text?.replace(/^(recordar|recordatorio)\s+/i, "").trim() ?? "";
    if (!title) {
      const message = "Indica que debo recordarte. Ejemplo: recordar revisar nomina manana.";
      await this.sendMessage(tenantRef, chatId, message);
      return message;
    }

    const dueAt = this.parseReminderDueAt(normalized);
    const type =
      roles.some((role) => role === UserRole.manager || role === UserRole.admin) &&
      normalized.includes("equipo")
      ? ReminderType.system
      : ReminderType.personal;

    await this.remindersService.createReminder({
      tenantId,
      userId,
      createdByUserId: userId,
      type,
      title,
      dueAt
    });
    const message = `Recordatorio guardado para ${dueAt.toLocaleString("es-DO")}.`;
    await this.sendMessage(tenantRef, chatId, message);
    return message;
  }

  private async deliverDueReminders(tenantId: string, chatId: string, userId: string) {
    const reminders = await this.remindersService.listDuePendingForUser(tenantId, userId);
    for (const reminder of reminders) {
      await this.sendMessage(tenantId, chatId, `Recordatorio: ${reminder.title}`);
      await this.remindersService.markDelivered(tenantId, reminder.id);
    }
  }

  private parseReminderDueAt(normalizedText: string) {
    const now = new Date();
    const dueAt = new Date(now.getTime() + 60 * 60 * 1000);
    const hourMatch = normalizedText.match(/(\d{1,2}):(\d{2})/);
    if (hourMatch) {
      dueAt.setHours(Number(hourMatch[1]), Number(hourMatch[2]), 0, 0);
    }

    if (normalizedText.includes("manana")) {
      dueAt.setDate(dueAt.getDate() + 1);
    } else if (normalizedText.includes("hoy")) {
      // same day
    }

    return dueAt;
  }

  private async extractMedia(message: any, tenantId: string, userId: string, tenantRef: string) {
    if (message.photo?.length) {
      const photo = message.photo[message.photo.length - 1];
      const buffer = await this.downloadTelegramFile(tenantRef, photo.file_id);
      const file = await this.storageService.saveFile({
        tenantId,
        fileName: `${photo.file_unique_id}.jpg`,
        mimeType: "image/jpeg",
        buffer,
        fileKind: FileKind.evidence,
        createdByUserId: userId
      });
      return {
        fileId: file.id,
        fileName: file.originalName,
        mimeType: file.mimeType
      };
    }

    if (message.document) {
      const buffer = await this.downloadTelegramFile(tenantRef, message.document.file_id);
      const file = await this.storageService.saveFile({
        tenantId,
        fileName: message.document.file_name ?? `${message.document.file_unique_id}.bin`,
        mimeType: message.document.mime_type ?? "application/octet-stream",
        buffer,
        fileKind: FileKind.document,
        createdByUserId: userId
      });
      return {
        fileId: file.id,
        fileName: file.originalName,
        mimeType: file.mimeType
      };
    }

    return null;
  }

  async sendMessage(tenantRef: string, chatId: string, text: string) {
    const token = await this.getBotToken(tenantRef);
    if (!token) return { ok: false, skipped: true };

    await fetch(`${process.env.TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    return { ok: true };
  }

  async sendDocument(
    tenantId: string,
    chatId: string,
    buffer: Buffer,
    fileName: string,
    caption: string
  ) {
    const settings = await this.settingsService.getSettings(tenantId);
    const token = settings.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { ok: false, skipped: true };

    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("caption", caption);
    formData.append(
      "document",
      new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
      fileName
    );

    await fetch(`${process.env.TELEGRAM_API_BASE}/bot${token}/sendDocument`, {
      method: "POST",
      body: formData
    });

    return { ok: true };
  }

  private async getBotToken(tenantRef: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [{ id: tenantRef }, { slug: tenantRef }]
      }
    });
    if (!tenant) {
      return process.env.TELEGRAM_BOT_TOKEN;
    }
    const settings = await this.settingsService.getSettings(tenant.id);
    return settings.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN;
  }

  private async downloadTelegramFile(tenantRef: string, fileId: string) {
    const token = await this.getBotToken(tenantRef);
    if (!token) return Buffer.from("");

    const fileResponse = await fetch(`${process.env.TELEGRAM_API_BASE}/bot${token}/getFile?file_id=${fileId}`);
    if (!fileResponse.ok) return Buffer.from("");
    const fileData = (await fileResponse.json()) as { result?: { file_path?: string } };
    const filePath = fileData.result?.file_path;
    if (!filePath) return Buffer.from("");

    const mediaResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!mediaResponse.ok) return Buffer.from("");

    return Buffer.from(await mediaResponse.arrayBuffer());
  }
}
