import { Injectable } from "@nestjs/common";

type Intent =
  | "auth_login"
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

@Injectable()
export class AiService {
  async transcribeAudio(buffer: Buffer) {
    if (!process.env.OPENAI_API_KEY) {
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

    const response = await fetch(`${process.env.OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      return "audio recibido pendiente de transcripcion real";
    }

    const data = (await response.json()) as { text?: string };
    return data.text ?? "audio recibido pendiente de transcripcion real";
  }

  async classifyMessage(text: string): Promise<{
    intent: Intent;
    confidence: number;
    entities: Record<string, string | number>;
  }> {
    const normalized = text.toLowerCase();

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
