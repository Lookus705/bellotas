# Arquitectura MVP 1

## Superficies

- `apps/api`: API NestJS con multitenancy, auth web, core operativo y contratos canónicos por dominio.
- `apps/web`: panel Next.js para `manager`, `RRHH` y `admin`.
- `apps/worker`: worker de notificaciones por email y Telegram.

## Ingreso canónico

- `POST /employee-events`
- `POST /customer-messages`
- `POST /email-events`
- `POST /erp-events`
- `POST /documents`

El canal y proveedor viajan como datos del payload. `n8n` u otros adaptadores externos transforman entradas de Telegram, WhatsApp, Gmail, Outlook o ERP al contrato canónico antes de llamar al backend.

## Compatibilidad temporal

- `POST /telegram/webhook/:tenantSlug` sigue expuesto, pero actua como adaptador legacy.
- Telegram ya no debe concentrar reglas de negocio; traduce y delega al contrato canónico de `employee-events`.

## Multitenancy

- todas las tablas de negocio tienen `tenantId`
- Telegram legacy resuelve tenant por ruta de webhook
- web resuelve tenant desde el usuario autenticado
- archivos se almacenan por prefijo de tenant en MinIO

## Identidad comercial

- `CommercialAccount`: cuenta comercial estable
- `ChannelEndpoint`: endpoint/canal estable
- `ContactPerson`: persona actual o historica asociada a la cuenta

La memoria comercial pertenece a la cuenta. La memoria conversacional personalizada pertenece a la persona actual. El endpoint puede cambiar de persona sin perder el historico comercial de la cuenta.
