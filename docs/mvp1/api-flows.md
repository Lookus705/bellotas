# Flujos API MVP 1

## Auth web

- `POST /api/auth/web/login`
- `GET /api/auth/me`
- `POST /api/auth/web/logout`

## Telegram

- `POST /api/telegram/webhook/:tenantSlug`

Compatibilidad temporal:

- el webhook Telegram traduce al contrato interno `POST /api/employee-events`
- no debe ser el punto de entrada arquitectonico principal a futuro

## Ingreso canónico

- `POST /api/employee-events`
- `POST /api/customer-messages`
- `POST /api/email-events`
- `POST /api/erp-events`
- `POST /api/documents`

Comandos base:

- `/start`
- `LOGIN CODIGO PIN`
- `iniciar ruta camion TRK-10 125000 km`
- `cerrar ruta 125450 km`
- `facturas 1001 1002 1003`
- `picking pedido PED-100 ruta R-12 camion TRK-10`
- `carga camion TRK-10 120 cajas 3400 kg`
- `incidencia accidente en ruta con averia`
- `nomina`

## Manager

- `GET /api/manager/driver-routes`
- `GET /api/manager/warehouse-pickings`
- `GET /api/manager/truck-loadings`
- `GET /api/manager/incidents`

## RRHH

- `GET /api/payroll`
- `POST /api/payroll/upload`
