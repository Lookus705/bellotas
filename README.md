# Bellotas MVP 1

Plataforma multitenant de automatizacion operativa asistida por IA para logistica y almacen.

## Incluye

- multitenancy base por tenant
- login web para `manager` y `RRHH`
- login Telegram por `employee_code + PIN`
- vinculacion de canal legacy Telegram con identidad neutral por `ChannelEndpoint`
- flujos MVP de chofer y almacenista
- audio en espanol con transcripcion
- clasificacion de intencion y extraccion minima
- aclaraciones cuando faltan campos obligatorios
- alertas graves por Telegram y email
- panel web basico para manager
- panel web basico para RRHH con subida de nominas PDF
- consulta de nomina por Telegram

## Stack

- NestJS + Prisma + PostgreSQL
- Next.js
- BullMQ + Redis
- MinIO para archivos
- MailHog para email local

## Arranque rapido

1. Copiar `.env.example` a `.env`
2. Configurar `TELEGRAM_BOT_TOKEN` y claves JWT
3. Ejecutar:

```bash
docker compose up --build
```

4. Aplicar migraciones y seed dentro del contenedor API:

```bash
docker compose exec api pnpm prisma:migrate
docker compose exec api pnpm seed
```

## Usuario demo

- tenant: `demo-logistica`
- manager: `MGR001 / 1234`
- rrhh: `RRHH001 / 1234`
- chofer: `DRV001 / 1234`
- almacen: `ALM001 / 1234`

## Superficies

- API: `http://localhost:4000`
- Web: `http://localhost:3001`
- MailHog: `http://localhost:8025`
- MinIO console: `http://localhost:9001`

## Notas

- El core expone endpoints canónicos por dominio:
  - `POST /employee-events`
  - `POST /customer-messages`
  - `POST /email-events`
  - `POST /erp-events`
  - `POST /documents`
- `POST /telegram/webhook/:tenantSlug` sigue existiendo como adaptador legacy temporal
- Si `OPENAI_API_KEY` no esta configurada, el sistema usa un clasificador por reglas como fallback
