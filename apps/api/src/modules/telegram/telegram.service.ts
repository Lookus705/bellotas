import { Injectable } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { ConversationService } from "../conversation/conversation.service";
import { AiService } from "../ai/ai.service";
import { OperationsService } from "../operations/operations.service";
import { PayrollService } from "../payroll/payroll.service";
import { StorageService } from "../storage/storage.service";
import { FileKind } from "@prisma/client";

@Injectable()
export class TelegramService {
  constructor(
    private readonly authService: AuthService,
    private readonly conversationService: ConversationService,
    private readonly aiService: AiService,
    private readonly operationsService: OperationsService,
    private readonly payrollService: PayrollService,
    private readonly storageService: StorageService
  ) {}

  async handleWebhook(tenantSlug: string, payload: any) {
    const message = payload.message ?? payload.edited_message;
    if (!message) return { ok: true };

    const telegramUserId = String(message.from?.id);
    const telegramChatId = String(message.chat?.id);
    const text = message.text?.trim();

    if (text?.startsWith("/start")) {
      await this.sendMessage(telegramChatId, "Bienvenido. Inicia sesion con: LOGIN CODIGO PIN");
      return { ok: true };
    }

    if (text?.toUpperCase().startsWith("LOGIN ")) {
      const parts = text.split(/\s+/);
      if (parts.length < 3) {
        await this.sendMessage(telegramChatId, "Formato invalido. Usa: LOGIN CODIGO PIN");
        return { ok: true };
      }

      const result = await this.authService.validateTelegramLogin(
        tenantSlug,
        parts[1],
        parts[2],
        telegramUserId,
        telegramChatId
      );

      await this.sendMessage(
        telegramChatId,
        `Sesion vinculada para ${result.user.fullName}. Puedes escribir INICIAR RUTA, CERRAR RUTA, FACTURAS, PICKING, CARGA, INCIDENCIA o NOMINA.`
      );
      return { ok: true };
    }

    const linkedUser = await this.authService.getTelegramUserByLink(tenantSlug, telegramUserId);
    if (!linkedUser) {
      await this.sendMessage(telegramChatId, "No tienes una sesion vinculada. Usa: LOGIN CODIGO PIN");
      return { ok: true };
    }

    const session = await this.conversationService.getOrCreateSession(linkedUser.tenant.id, linkedUser.user.id);

    let finalText = text;
    if (!finalText && message.voice) {
      const audioBuffer = await this.downloadTelegramFile(message.voice.file_id);
      await this.storageService.saveFile({
        tenantId: linkedUser.tenant.id,
        fileName: `${message.voice.file_unique_id}.ogg`,
        mimeType: "audio/ogg",
        buffer: audioBuffer,
        fileKind: FileKind.audio,
        createdByUserId: linkedUser.user.id
      });
      finalText = await this.aiService.transcribeAudio(audioBuffer);
    }

    if (!finalText) {
      await this.sendMessage(telegramChatId, "No pude procesar el mensaje. Envia texto o audio.");
      return { ok: true };
    }

    const classified = await this.aiService.classifyMessage(finalText);

    await this.conversationService.saveInboundMessage({
      tenantId: linkedUser.tenant.id,
      sessionId: session.id,
      userId: linkedUser.user.id,
      messageType: message.voice ? "audio" : "text",
      rawText: text,
      transcriptText: message.voice ? finalText : undefined,
      intent: classified.intent,
      confidence: classified.confidence,
      entities: classified.entities
    });

    const response = await this.resolveIntent({
      tenantId: linkedUser.tenant.id,
      userId: linkedUser.user.id,
      sessionId: session.id,
      chatId: telegramChatId,
      text: finalText,
      classified
    });

    await this.conversationService.saveOutboundMessage({
      tenantId: linkedUser.tenant.id,
      sessionId: session.id,
      userId: linkedUser.user.id,
      text: response
    });

    await this.sendMessage(telegramChatId, response);
    return { ok: true };
  }

  private async resolveIntent(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    chatId: string;
    text: string;
    classified: { intent: string; entities: Record<string, string | number> };
  }) {
    switch (params.classified.intent) {
      case "driver_route_start":
        if (!params.classified.entities.vehicleLabel || !params.classified.entities.odometer) {
          return "Para iniciar ruta necesito camion y kilometraje de salida. Ejemplo: iniciar ruta camion TRK-10 125000 km";
        }
        await this.operationsService.startDriverRoute({
          tenantId: params.tenantId,
          userId: params.userId,
          sessionId: params.sessionId,
          vehicleLabel: String(params.classified.entities.vehicleLabel),
          odometer: Number(params.classified.entities.odometer)
        });
        return "Ruta iniciada correctamente.";

      case "driver_route_end": {
        if (!params.classified.entities.odometer) {
          return "Para cerrar ruta necesito el kilometraje final. Ejemplo: cerrar ruta 125450 km";
        }
        const invoices = typeof params.classified.entities.invoices === "string"
          ? String(params.classified.entities.invoices).split(",").filter(Boolean)
          : undefined;
        await this.operationsService.closeDriverRoute({
          tenantId: params.tenantId,
          userId: params.userId,
          odometer: Number(params.classified.entities.odometer),
          invoices
        });
        return "Ruta cerrada correctamente.";
      }

      case "driver_invoice_report": {
        const invoices = typeof params.classified.entities.invoices === "string"
          ? String(params.classified.entities.invoices).split(",").filter(Boolean)
          : [];
        if (invoices.length === 0) {
          return "Necesito al menos un numero de factura. Ejemplo: facturas 1001 1002 1003";
        }
        await this.operationsService.registerDriverInvoices({
          tenantId: params.tenantId,
          userId: params.userId,
          invoices
        });
        return `Facturas registradas: ${invoices.join(", ")}`;
      }

      case "driver_incident": {
        const severity = this.aiService.classifySeverity(params.text);
        await this.operationsService.registerDriverIncident({
          tenantId: params.tenantId,
          userId: params.userId,
          title: "Incidencia de ruta",
          description: params.text,
          severity,
          incidentType: this.detectIncidentType(params.text)
        });
        return severity === "high" || severity === "critical"
          ? "Incidencia grave registrada. Ya se enviaron alertas."
          : "Incidencia registrada.";
      }

      case "warehouse_picking":
        if (!params.classified.entities.orderRef) {
          return "Para registrar picking necesito el pedido. Ejemplo: picking pedido PED-100 ruta R-12 camion TRK-10";
        }
        await this.operationsService.createWarehousePicking({
          tenantId: params.tenantId,
          userId: params.userId,
          sessionId: params.sessionId,
          orderRef: String(params.classified.entities.orderRef),
          routeRef: params.classified.entities.routeRef ? String(params.classified.entities.routeRef) : undefined,
          vehicleLabel: params.classified.entities.vehicleLabel ? String(params.classified.entities.vehicleLabel) : undefined,
          notes: params.text
        });
        return "Picking registrado.";

      case "warehouse_loading":
        if (!params.classified.entities.vehicleLabel) {
          return "Para registrar carga necesito el camion. Ejemplo: carga camion TRK-10 120 cajas 3400 kg";
        }
        await this.operationsService.createTruckLoading({
          tenantId: params.tenantId,
          userId: params.userId,
          sessionId: params.sessionId,
          vehicleLabel: String(params.classified.entities.vehicleLabel),
          boxCount: params.classified.entities.boxCount ? Number(params.classified.entities.boxCount) : undefined,
          weightKg: params.classified.entities.weightKg ? Number(params.classified.entities.weightKg) : undefined,
          notes: params.text
        });
        return "Carga registrada.";

      case "warehouse_incident": {
        const severity = this.aiService.classifySeverity(params.text);
        await this.operationsService.registerWarehouseIncident({
          tenantId: params.tenantId,
          userId: params.userId,
          title: "Incidencia de almacen",
          description: params.text,
          severity,
          incidentType: this.detectIncidentType(params.text)
        });
        return severity === "high" || severity === "critical"
          ? "Incidencia grave de almacen registrada. Ya se enviaron alertas."
          : "Incidencia de almacen registrada.";
      }

      case "hr_payroll_query": {
        const payroll = await this.payrollService.getLatestPayrollForEmployee(params.tenantId, params.userId);
        if (!payroll) return "No encontre una nomina disponible para tu usuario.";
        await this.sendDocument(
          params.chatId,
          payroll.buffer,
          `nomina-${payroll.payroll.periodYear}-${payroll.payroll.periodMonth}.pdf`,
          `Nomina ${payroll.payroll.periodMonth}/${payroll.payroll.periodYear}`
        );
        return `Te envie la nomina ${payroll.payroll.periodMonth}/${payroll.payroll.periodYear} en PDF.`;
      }

      default:
        return "No entendi el mensaje. Puedes usar: INICIAR RUTA, CERRAR RUTA, FACTURAS, PICKING, CARGA, INCIDENCIA o NOMINA.";
    }
  }

  private detectIncidentType(text: string) {
    const normalized = text.toLowerCase();
    if (normalized.includes("accidente")) return "accident";
    if (normalized.includes("pinchada")) return "flat_tire";
    if (normalized.includes("averia")) return "breakdown";
    if (normalized.includes("frio")) return "cold_chain_issue";
    if (normalized.includes("rechazo")) return "major_rejection";
    return "general";
  }

  async sendMessage(chatId: string, text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { ok: false, skipped: true };

    await fetch(`${process.env.TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    return { ok: true };
  }

  async sendDocument(chatId: string, buffer: Buffer, fileName: string, caption: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
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

  private async downloadTelegramFile(fileId: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return Buffer.from("");

    const fileResponse = await fetch(`${process.env.TELEGRAM_API_BASE}/bot${token}/getFile?file_id=${fileId}`);
    if (!fileResponse.ok) return Buffer.from("");
    const fileData = (await fileResponse.json()) as { result?: { file_path?: string } };
    const filePath = fileData.result?.file_path;
    if (!filePath) return Buffer.from("");

    const audioResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!audioResponse.ok) return Buffer.from("");

    return Buffer.from(await audioResponse.arrayBuffer());
  }
}
