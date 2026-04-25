import { Prisma } from "@prisma/client";

export interface CanonicalIntegrationAuthContext {
  tenantId: string;
  tenantSlug: string;
  integrationId: string;
  integrationName: string;
  scopes: string[];
}

export interface EmployeeEventPayload {
  channel: string;
  provider: string;
  externalEventId?: string;
  endpointExternalId?: string;
  employeeCode: string;
  eventType: string;
  payload: Record<string, unknown>;
  timestamp?: string;
}

export interface CustomerMessagePayload {
  channel: string;
  provider: string;
  externalEventId?: string;
  endpointExternalId: string;
  accountHints?: {
    externalRef?: string;
    name?: string;
  };
  personHints?: {
    fullName?: string;
    alias?: string;
  };
  message: {
    text?: string;
    subject?: string;
    body?: string;
  };
  attachments?: Array<{
    fileName: string;
    mimeType: string;
    base64Content: string;
  }>;
  timestamp?: string;
}

export interface EmailEventPayload {
  channel: string;
  provider: string;
  externalEventId?: string;
  endpointExternalId: string;
  accountHints?: {
    externalRef?: string;
    name?: string;
  };
  personHints?: {
    fullName?: string;
    alias?: string;
  };
  subject?: string;
  body?: string;
  attachments?: Array<{
    fileName: string;
    mimeType: string;
    base64Content: string;
  }>;
  timestamp?: string;
}

export interface ErpEventPayload {
  channel: string;
  provider: string;
  externalEventId?: string;
  entityType: string;
  eventType: string;
  externalId: string;
  accountHints?: {
    externalRef?: string;
    name?: string;
  };
  payload: Record<string, unknown>;
  timestamp?: string;
}

export interface CanonicalDocumentPayload {
  sourceType: string;
  channel: string;
  provider: string;
  externalEventId?: string;
  endpointExternalId?: string;
  employeeCode?: string;
  accountHints?: {
    externalRef?: string;
    name?: string;
  };
  personHints?: {
    fullName?: string;
    alias?: string;
  };
  area: string;
  category: string;
  title: string;
  description?: string;
  useForAi?: boolean;
  file: {
    fileName: string;
    mimeType: string;
    base64Content: string;
  };
}

export type JsonObject = Prisma.JsonObject;
