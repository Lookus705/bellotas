# Integrations API for n8n

## Purpose

This module exposes a machine-to-machine API on top of the NestJS backend. `n8n` must call these endpoints instead of writing directly to the database.

## Authentication

- Header required on every request:
  - `x-api-key: <integration key>`
- Demo key after seed:
  - `bellotas-demo-n8n-key`

The API key is linked to one tenant and one integration profile. The backend remains the source of truth.

## Idempotency

Every `POST` endpoint requires:

- `x-idempotency-key: <unique operation key>`

Rules:

- same tenant + same endpoint operation + same idempotency key + same payload:
  - returns the original stored response with `idempotentReplay: true`
- same tenant + same operation + same idempotency key + different payload:
  - returns `400`

## Common errors

- `400`: invalid payload or invalid idempotency reuse
- `401`: missing `x-api-key`
- `403`: invalid API key or missing scope
- `404`: employee not found or resource not found

## Endpoints canónicos

### POST `/api/employee-events`

Contrato interno para eventos de empleados, independientemente del canal.

Payload:

```json
{
  "channel": "telegram",
  "provider": "n8n",
  "externalEventId": "evt-001",
  "endpointExternalId": "user-telegram-123",
  "employeeCode": "DRV001",
  "eventType": "conversation.message",
  "payload": {
    "text": "iniciar ruta camion TRK-10 125000 km"
  }
}
```

### POST `/api/customer-messages`

Contrato interno para mensajes de clientes.

### POST `/api/email-events`

Contrato interno para correos normalizados.

### POST `/api/erp-events`

Contrato interno para eventos ERP.

### POST `/api/documents`

Contrato interno para ingreso documental neutral al canal.

## Endpoints legacy de compatibilidad

### POST `/api/integrations/check-in`

Creates a driver route start.

Required headers:
- `x-api-key`
- `x-idempotency-key`

Payload:

```json
{
  "employeeCode": "DRV001",
  "vehicleLabel": "TRK-10",
  "odometer": 125000,
  "channel": "telegram"
}
```

Response:

```json
{
  "routeId": "cm...",
  "status": "started",
  "vehicleLabel": "TRK-10",
  "startedAt": "2026-04-15T02:00:00.000Z"
}
```

### POST `/api/integrations/check-out`

Closes the active route for a driver.

Payload:

```json
{
  "employeeCode": "DRV001",
  "odometer": 125450,
  "invoices": ["1001", "1002"]
}
```

Response:

```json
{
  "routeId": "cm...",
  "status": "closed",
  "closedAt": "2026-04-15T02:05:00.000Z",
  "endOdometer": 125450
}
```

### POST `/api/integrations/incidents`

Creates a driver or warehouse incident.

Payload:

```json
{
  "employeeCode": "DRV001",
  "sourceType": "driver",
  "incidentType": "accident",
  "title": "Accidente reportado",
  "description": "Choque leve en ruta con averia frontal",
  "severity": "high"
}
```

If `severity` is omitted, the backend classifies it.

Response:

```json
{
  "incidentId": "cm...",
  "severity": "high",
  "status": "open"
}
```

### POST `/api/integrations/warehouse/picking`

Registers a picking operation.

Payload:

```json
{
  "employeeCode": "ALM001",
  "orderRef": "PED-1001",
  "routeRef": "R-12",
  "vehicleLabel": "TRK-10",
  "notes": "Picking completo",
  "channel": "telegram"
}
```

Response:

```json
{
  "pickingId": "cm...",
  "orderRef": "PED-1001",
  "pickedAt": "2026-04-15T02:10:00.000Z"
}
```

### POST `/api/integrations/warehouse/loading`

Registers truck loading.

Payload:

```json
{
  "employeeCode": "ALM001",
  "vehicleLabel": "TRK-20",
  "boxCount": 55,
  "weightKg": 820.5,
  "notes": "Carga finalizada",
  "channel": "telegram"
}
```

Response:

```json
{
  "loadingId": "cm...",
  "vehicleLabel": "TRK-20",
  "loadedAt": "2026-04-15T02:12:00.000Z"
}
```

### GET `/api/integrations/payroll/:employeeCode/latest`

Returns the latest payroll metadata plus `fileBase64`.

Response:

```json
{
  "found": true,
  "employeeCode": "DRV001",
  "periodYear": 2026,
  "periodMonth": 4,
  "fileName": "nomina-abril.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 123456,
  "fileBase64": "JVBERi0xLjQK..."
}
```

If no payroll exists:

```json
{
  "found": false,
  "employeeCode": "DRV001",
  "message": "No payroll found"
}
```

### POST `/api/integrations/conversation/message`

Classifies a generic conversational message and, if all minimum fields are present, applies the business action.

Payload:

```json
{
  "employeeCode": "DRV001",
  "text": "iniciar ruta camion TRK-10 125000 km",
  "channel": "telegram"
}
```

Response:

```json
{
  "intent": "driver_route_start",
  "confidence": 0.85,
  "entities": {
    "vehicleLabel": "TRK-10",
    "odometer": 125000
  },
  "missingFields": [],
  "completed": true,
  "appliedAction": {
    "type": "driver_route_started",
    "routeId": "cm..."
  }
}
```

If data is incomplete:

```json
{
  "intent": "warehouse_loading",
  "confidence": 0.82,
  "entities": {},
  "missingFields": ["vehicleLabel"],
  "completed": false,
  "appliedAction": null
}
```

### POST `/api/integrations/conversation/audio`

Transcribes audio and then processes it like the generic conversation message endpoint.

Payload:

```json
{
  "employeeCode": "DRV001",
  "base64Audio": "<base64>",
  "channel": "telegram"
}
```

Response:

```json
{
  "transcript": "iniciar ruta camion TRK-10 125000 km",
  "intent": "driver_route_start",
  "confidence": 0.85,
  "entities": {
    "vehicleLabel": "TRK-10",
    "odometer": 125000
  },
  "missingFields": [],
  "completed": true,
  "appliedAction": {
    "type": "driver_route_started",
    "routeId": "cm..."
  }
}
```

### GET `/api/integrations/operational/employee/:employeeCode`

Light operational lookup for automation flows.

Response:

```json
{
  "id": "cm...",
  "employeeCode": "DRV001",
  "fullName": "Chofer Demo",
  "roles": ["chofer"]
}
```
