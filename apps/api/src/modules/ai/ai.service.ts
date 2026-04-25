import { Injectable } from "@nestjs/common";
import { OperationalNoteType } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";

type Intent =
  | "auth_login"
  | "assigned_work_query"
  | "assigned_work_detail_query"
  | "assigned_work_acknowledge"
  | "assigned_work_complete"
  | "driver_route_start"
  | "driver_route_end"
  | "driver_invoice_report"
  | "driver_incident"
  | "warehouse_picking"
  | "warehouse_loading"
  | "warehouse_incident"
  | "hr_payroll_query"
  | "help"
  | "unknown";

type IncidentSeverity = "low" | "medium" | "high" | "critical";

type OperationalMemorySuggestion = {
  suggestedType: OperationalNoteType;
  target: "work_item" | "account" | "person";
  confidence: number;
  summary: string;
};

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  async transcribeAudio(tenantId: string, buffer: Buffer) {
    const tenantConfig = await this.getTenantAiConfig(tenantId);
    const apiKey = tenantConfig.apiKey ?? process.env.OPENAI_API_KEY;
    const baseUrl = tenantConfig.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

    if (!apiKey || tenantConfig.provider !== "openai") {
      return "audio recibido pendiente de transcripcion real";
    }

    const formData = new FormData();
    formData.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe");
    formData.append("language", "es");
    formData.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: "audio/ogg" }),
      "audio.ogg"
    );

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      return "audio recibido pendiente de transcripcion real";
    }

    const data = (await response.json()) as { text?: string };
    return data.text ?? "audio recibido pendiente de transcripcion real";
  }

  async classifyMessage(tenantId: string, text: string): Promise<{
    intent: Intent;
    confidence: number;
    entities: Record<string, string | number>;
  }> {
    const tenantConfig = await this.getTenantAiConfig(tenantId);
    if (tenantConfig.provider === "openai" && tenantConfig.apiKey) {
      const llmResult = await this.classifyMessageWithOpenAi(text, tenantConfig);
      if (llmResult) {
        return llmResult;
      }
    }

    return this.classifyMessageWithRules(text);
  }

  classifySeverity(text: string): IncidentSeverity {
    const normalized = text.toLowerCase();
    if (/(accidente|averia|frio|pinchada|rechazo importante)/.test(normalized)) {
      return "high";
    }
    if (/rechazo/.test(normalized)) {
      return "medium";
    }
    return "low";
  }

  async buildClarificationMessage(tenantId: string, intent: string, missingFields: string[]) {
    const settings = await this.getTenantSettings(tenantId);
    const fieldLabels = missingFields.map((field) => this.fieldLabel(field)).join(", ");
    const contextHint = this.intentHint(intent);
    const companyPrefix = settings?.companyName ? `${settings.companyName}: ` : "";
    return `${companyPrefix}necesito ${fieldLabels} para continuar.${contextHint}`;
  }

  async buildUnknownMessage(tenantId: string) {
    const settings = await this.getTenantSettings(tenantId);
    const documentContext = await this.getDocumentContext(tenantId, "operacion");
    const profileLabel = this.businessProfileLabel(settings?.businessProfile);
    const companyPrefix = settings?.companyName ? `${settings.companyName}: ` : "";
    const instructionHint = settings?.assistantInstructions
      ? " Estoy siguiendo la configuracion operativa de tu empresa."
      : "";
    const documentHint = documentContext ? ` Contexto documental disponible: ${documentContext}.` : "";
    return `${companyPrefix}no entendi el mensaje.${instructionHint}${documentHint} Puedes pedir ayuda, consultar tu trabajo asignado, consultar nomina o registrar una operacion de ${profileLabel}.`;
  }

  async buildHelpMessage(tenantId: string) {
    const settings = await this.getTenantSettings(tenantId);
    const documentContext = await this.getDocumentContext(tenantId, "operacion");
    const companyPrefix = settings?.companyName ? `${settings.companyName}: ` : "";
    const profile = settings?.businessProfile ?? "logistics";
    const documentHint = documentContext ? ` Referencias activas: ${documentContext}.` : "";

    if (profile === "beauty_salon") {
      return `${companyPrefix}puedes consultar agenda, tu trabajo asignado, registrar incidencias, pedir ayuda o iniciar un flujo de atencion.${documentHint}`;
    }

    return `${companyPrefix}puedes usar: INICIAR RUTA, CERRAR RUTA, FACTURAS, PICKING, CARGA, INCIDENCIA, TRABAJO ASIGNADO o NOMINA.${documentHint}`;
  }

  async proposeOperationalMemory(
    tenantId: string,
    text: string
  ): Promise<OperationalMemorySuggestion | null> {
    const normalized = text.trim();
    if (!normalized) {
      return null;
    }

    const tenantConfig = await this.getTenantAiConfig(tenantId);
    if (tenantConfig.provider === "openai" && tenantConfig.apiKey) {
      const llmSuggestion = await this.proposeOperationalMemoryWithOpenAi(normalized, tenantConfig);
      if (llmSuggestion) {
        return llmSuggestion;
      }
    }

    return this.proposeOperationalMemoryWithRules(normalized);
  }

  private async classifyMessageWithOpenAi(
    text: string,
    tenantConfig: {
      tenantId: string;
      provider: string;
      apiKey: string | null;
      model: string;
      baseUrl: string;
      companyName?: string | null;
      businessProfile?: string | null;
      assistantInstructions?: string | null;
      operationalInstructions?: string | null;
      hrInstructions?: string | null;
    }
  ): Promise<{
    intent: Intent;
    confidence: number;
    entities: Record<string, string | number>;
  } | null> {
    try {
      const documentContext = await this.getDocumentContext(
        tenantConfig.tenantId,
        tenantConfig.businessProfile === "beauty_salon" ? "empresa" : "operacion",
        text
      );
      const response = await fetch(`${tenantConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tenantConfig.apiKey}`
        },
        body: JSON.stringify({
          model: tenantConfig.model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "Clasifica mensajes operativos internos en espanol.",
                `Empresa: ${tenantConfig.companyName ?? "Sin nombre"}.`,
                `Perfil de negocio: ${tenantConfig.businessProfile ?? "logistics"}.`,
                tenantConfig.assistantInstructions ?? "",
                tenantConfig.operationalInstructions ?? "",
                tenantConfig.hrInstructions ?? "",
                documentContext ? `Contexto documental autorizado: ${documentContext}` : "",
                "Devuelve JSON con: intent, confidence, entities.",
                "Intent válidos: auth_login, assigned_work_query, assigned_work_detail_query, assigned_work_acknowledge, assigned_work_complete, driver_route_start, driver_route_end, driver_invoice_report, driver_incident, warehouse_picking, warehouse_loading, warehouse_incident, hr_payroll_query, help, unknown.",
                "Entities válidas: odometer, vehicleLabel, invoices, boxCount, weightKg, orderRef, routeRef."
              ]
                .filter(Boolean)
                .join(" ")
            },
            {
              role: "user",
              content: text
            }
          ]
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return null;
      }

      const parsed = JSON.parse(content) as {
        intent?: string;
        confidence?: number;
        entities?: Record<string, unknown>;
      };

      return {
        intent: this.normalizeIntent(parsed.intent),
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.65,
        entities: this.normalizeEntities(parsed.entities)
      };
    } catch {
      return null;
    }
  }

  private async proposeOperationalMemoryWithOpenAi(
    text: string,
    tenantConfig: {
      tenantId: string;
      provider: string;
      apiKey: string | null;
      model: string;
      baseUrl: string;
      companyName?: string | null;
      businessProfile?: string | null;
      assistantInstructions?: string | null;
      operationalInstructions?: string | null;
      hrInstructions?: string | null;
    }
  ): Promise<OperationalMemorySuggestion | null> {
    try {
      const response = await fetch(`${tenantConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tenantConfig.apiKey}`
        },
        body: JSON.stringify({
          model: tenantConfig.model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "Clasifica texto operativo breve en una memoria util.",
                "Tipos validos: work_note, person_preference, account_rule, provisional_observation.",
                "Targets validos: work_item, person, account.",
                "Devuelve JSON con: suggestedType, target, confidence, summary.",
                "Si no es una memoria clara, usa provisional_observation y confidence baja."
              ].join(" ")
            },
            {
              role: "user",
              content: text
            }
          ]
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return null;
      }

      const parsed = JSON.parse(content) as {
        suggestedType?: string;
        target?: string;
        confidence?: number;
        summary?: string;
      };

      return {
        suggestedType: this.normalizeOperationalNoteType(parsed.suggestedType),
        target: this.normalizeMemoryTarget(parsed.target),
        confidence:
          typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
            ? parsed.confidence
            : 0.6,
        summary: typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim().slice(0, 200)
          : text.slice(0, 200)
      };
    } catch {
      return null;
    }
  }

  private classifyMessageWithRules(text: string): {
    intent: Intent;
    confidence: number;
    entities: Record<string, string | number>;
  } {
    const normalized = text.toLowerCase();

    if (normalized.includes("ayuda")) {
      return { intent: "help", confidence: 0.92, entities: {} };
    }
    if (
      normalized.includes("detalle de mi ruta") ||
      normalized.includes("detalle de mi trabajo") ||
      normalized.includes("detalle del trabajo") ||
      normalized.includes("detalle del pedido") ||
      normalized.includes("detalle de la cita") ||
      normalized.includes("que incluye mi ruta") ||
      normalized.includes("que incluye mi trabajo") ||
      normalized.includes("muestrame mi ruta") ||
      normalized.includes("muestrame mi trabajo") ||
      normalized.includes("ver mi ruta") ||
      normalized.includes("ver mi trabajo")
    ) {
      return { intent: "assigned_work_detail_query", confidence: 0.9, entities: {} };
    }
    if (
      normalized.includes("trabajo recibido") ||
      normalized.includes("ruta recibida") ||
      normalized.includes("pedido recibido") ||
      normalized.includes("cita recibida") ||
      normalized.includes("lo recibi") ||
      normalized.includes("ya lo recibi") ||
      normalized.includes("ya recibi el trabajo")
    ) {
      return { intent: "assigned_work_acknowledge", confidence: 0.9, entities: {} };
    }
    if (
      normalized.includes("trabajo completado") ||
      normalized.includes("trabajo terminado") ||
      normalized.includes("trabajo finalizado") ||
      normalized.includes("ruta completada") ||
      normalized.includes("pedido completado") ||
      normalized.includes("cita completada") ||
      normalized.includes("ya termine el trabajo") ||
      normalized.includes("ya complete el trabajo") ||
      normalized.includes("trabajo listo")
    ) {
      return { intent: "assigned_work_complete", confidence: 0.9, entities: {} };
    }
    if (
      normalized.includes("trabajo asignado") ||
      normalized.includes("tengo asignado") ||
      normalized.includes("mi trabajo") ||
      normalized.includes("mis trabajos") ||
      normalized.includes("mi ruta") ||
      normalized.includes("mis rutas") ||
      normalized.includes("mis pedidos") ||
      normalized.includes("mis citas") ||
      (normalized.includes("tengo hoy") &&
        /(trabajo|ruta|pedido|cita)/.test(normalized)) ||
      (normalized.includes("me toca") &&
        /(trabajo|ruta|pedido|cita)/.test(normalized))
    ) {
      return { intent: "assigned_work_query", confidence: 0.9, entities: {} };
    }
    if (normalized.includes("nomina")) {
      return { intent: "hr_payroll_query", confidence: 0.95, entities: {} };
    }
    if (normalized.includes("iniciar ruta") || normalized.includes("salgo")) {
      return { intent: "driver_route_start", confidence: 0.85, entities: this.extractCommonEntities(text) };
    }
    if (normalized.includes("cerrar ruta") || normalized.includes("regrese")) {
      return { intent: "driver_route_end", confidence: 0.84, entities: this.extractCommonEntities(text) };
    }
    if (normalized.includes("factura")) {
      return { intent: "driver_invoice_report", confidence: 0.83, entities: this.extractCommonEntities(text) };
    }
    if (normalized.includes("picking")) {
      return { intent: "warehouse_picking", confidence: 0.86, entities: this.extractCommonEntities(text) };
    }
    if (normalized.includes("carga") || normalized.includes("camion cargado")) {
      return { intent: "warehouse_loading", confidence: 0.82, entities: this.extractCommonEntities(text) };
    }
    if (/(accidente|averia|pinchada|frio|rechazo|incidencia|problema)/.test(normalized)) {
      const intent = normalized.includes("picking") || normalized.includes("carga")
        ? "warehouse_incident"
        : "driver_incident";
      return { intent, confidence: 0.8, entities: this.extractCommonEntities(text) };
    }
    return { intent: "unknown", confidence: 0.3, entities: {} };
  }

  private proposeOperationalMemoryWithRules(text: string): OperationalMemorySuggestion {
    const normalized = text.toLowerCase();

    if (/(prefiere|siempre pide|le gusta|no le gusta|atenderle|atienda)/.test(normalized)) {
      return {
        suggestedType: OperationalNoteType.person_preference,
        target: "person",
        confidence: 0.76,
        summary: text.slice(0, 200)
      };
    }

    if (/(meli[aá]|cliente|cuenta|hotel|descansan|horario|entrega|puerta|recepci[oó]n|compras)/.test(normalized)) {
      return {
        suggestedType: OperationalNoteType.account_rule,
        target: "account",
        confidence: 0.72,
        summary: text.slice(0, 200)
      };
    }

    if (/(hoy|esta vez|esta ruta|este pedido|esta cita|llevar|avisar|anotar)/.test(normalized)) {
      return {
        suggestedType: OperationalNoteType.work_note,
        target: "work_item",
        confidence: 0.66,
        summary: text.slice(0, 200)
      };
    }

    return {
      suggestedType: OperationalNoteType.provisional_observation,
      target: "work_item",
      confidence: 0.42,
      summary: text.slice(0, 200)
    };
  }

  private async getTenantAiConfig(tenantId: string) {
    const settings = await this.getTenantSettings(tenantId);
    return {
      provider: settings?.aiProvider ?? "rules",
      apiKey: settings?.aiApiKey ?? null,
      model: settings?.aiModel ?? process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini",
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      tenantId,
      companyName: settings?.companyName,
      businessProfile: settings?.businessProfile,
      assistantInstructions: settings?.assistantInstructions,
      operationalInstructions: settings?.operationalInstructions,
      hrInstructions: settings?.hrInstructions
    };
  }

  private async getTenantSettings(tenantId: string) {
    return this.prisma.tenantSettings.findUnique({
      where: { tenantId }
    });
  }

  private async getDocumentContext(tenantId: string, area?: string, query?: string) {
    const documents = await this.prisma.tenantDocument.findMany({
      where: {
        tenantId,
        useForAi: true,
        extractedText: {
          not: null
        },
        ...(area ? { area } : {})
      },
      orderBy: { createdAt: "desc" },
      take: 12
    });

    if (documents.length === 0) {
      return "";
    }

    const normalizedTerms = (query ?? "")
      .toLowerCase()
      .split(/\W+/)
      .filter((term) => term.length > 2);

    const ranked = documents
      .map((document) => {
        const haystack = `${document.title} ${document.description ?? ""} ${document.extractedText ?? ""}`.toLowerCase();
        const score = normalizedTerms.reduce(
          (total, term) => total + (haystack.includes(term) ? 1 : 0),
          0
        );
        return {
          document,
          score
        };
      })
      .sort((left, right) => right.score - left.score || 0)
      .slice(0, 3);

    return ranked
      .map(({ document }) => {
        const snippetSource = document.extractedText?.replace(/\s+/g, " ").trim() ?? "";
        const snippet = snippetSource.slice(0, 280);
        return `${document.title}: ${snippet}`;
      })
      .join(" || ");
  }

  private normalizeIntent(intent?: string): Intent {
    const allowed: Intent[] = [
      "auth_login",
      "assigned_work_query",
      "assigned_work_detail_query",
      "assigned_work_acknowledge",
      "assigned_work_complete",
      "driver_route_start",
      "driver_route_end",
      "driver_invoice_report",
      "driver_incident",
      "warehouse_picking",
      "warehouse_loading",
      "warehouse_incident",
      "hr_payroll_query",
      "help",
      "unknown"
    ];

    return allowed.includes(intent as Intent) ? (intent as Intent) : "unknown";
  }

  private normalizeEntities(entities?: Record<string, unknown>) {
    const normalized: Record<string, string | number> = {};
    if (!entities) {
      return normalized;
    }

    const stringKeys = ["vehicleLabel", "invoices", "orderRef", "routeRef"] as const;
    const numericKeys = ["odometer", "boxCount", "weightKg"] as const;

    for (const key of stringKeys) {
      const value = entities[key];
      if (typeof value === "string" && value.trim()) {
        normalized[key] = value.trim();
      }
    }

    for (const key of numericKeys) {
      const value = entities[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        normalized[key] = value;
      }
      if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
        normalized[key] = Number(value);
      }
    }

    return normalized;
  }

  private normalizeOperationalNoteType(type?: string) {
    const allowed = new Set<OperationalNoteType>([
      OperationalNoteType.work_note,
      OperationalNoteType.person_preference,
      OperationalNoteType.account_rule,
      OperationalNoteType.provisional_observation
    ]);

    return allowed.has(type as OperationalNoteType)
      ? (type as OperationalNoteType)
      : OperationalNoteType.provisional_observation;
  }

  private normalizeMemoryTarget(target?: string) {
    if (target === "account" || target === "person" || target === "work_item") {
      return target;
    }

    return "work_item" as const;
  }

  private fieldLabel(field: string) {
    const labels: Record<string, string> = {
      vehicleLabel: "camion",
      odometer: "kilometraje",
      orderRef: "pedido",
      boxCount: "cantidad de cajas",
      weightKg: "peso",
      invoices: "facturas"
    };

    return labels[field] ?? field;
  }

  private intentHint(intent: string) {
    const hints: Record<string, string> = {
      assigned_work_query: " Ejemplo: que trabajo tengo hoy",
      assigned_work_detail_query: " Ejemplo: detalle de mi ruta",
      assigned_work_acknowledge: " Ejemplo: trabajo recibido",
      assigned_work_complete: " Ejemplo: trabajo completado",
      driver_route_start: " Ejemplo: iniciar ruta camion TRK-10 125000 km",
      driver_route_end: " Ejemplo: cerrar ruta 125450 km",
      driver_invoice_report: " Ejemplo: facturas 1001 1002 1003",
      warehouse_picking: " Ejemplo: picking pedido PED-100 ruta R-12 camion TRK-10",
      warehouse_loading: " Ejemplo: carga camion TRK-10 120 cajas 3400 kg"
    };

    return hints[intent] ?? "";
  }

  private businessProfileLabel(profile?: string | null) {
    const labels: Record<string, string> = {
      logistics: "logistica",
      beauty_salon: "salon de belleza"
    };

    return labels[profile ?? "logistics"] ?? "la empresa";
  }

  private extractCommonEntities(text: string) {
    const entities: Record<string, string | number> = {};
    const odometer = text.match(/(\d{2,7})\s?(km|kms|kilometros|millas)/i);
    const vehicle = text.match(/camion\s+([A-Za-z0-9-]+)/i);
    const invoices = [...text.matchAll(/\b\d{3,12}\b/g)].map((item) => item[0]);
    const boxes = text.match(/(\d+)\s+cajas/i);
    const weight = text.match(/(\d+(?:\.\d+)?)\s?(kg|kilos)/i);
    const orderRef = text.match(/pedido\s+([A-Za-z0-9-]+)/i);
    const routeRef = text.match(/ruta\s+([A-Za-z0-9-]+)/i);

    if (odometer) entities.odometer = Number(odometer[1]);
    if (vehicle) entities.vehicleLabel = vehicle[1];
    if (invoices.length > 0) entities.invoices = invoices.join(",");
    if (boxes) entities.boxCount = Number(boxes[1]);
    if (weight) entities.weightKg = Number(weight[1]);
    if (orderRef) entities.orderRef = orderRef[1];
    if (routeRef) entities.routeRef = routeRef[1];

    return entities;
  }
}
