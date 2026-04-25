export interface IntegrationAuthContext {
  tenantId: string;
  tenantSlug: string;
  integrationId: string;
  integrationName: string;
  scopes: string[];
}
