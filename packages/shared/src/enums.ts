export const USER_ROLES = [
  "chofer",
  "almacenista",
  "supervisor",
  "manager",
  "rrhh",
  "admin"
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_TYPES = [
  "accident",
  "flat_tire",
  "breakdown",
  "major_rejection",
  "cold_chain_issue",
  "general"
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INTENTS = [
  "auth_login",
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
] as const;

export type Intent = (typeof INTENTS)[number];
