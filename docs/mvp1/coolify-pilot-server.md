# Piloto real en Coolify

## Objetivo

Levantar una instancia estable para una prueba real en empresa con:

- `web` publica
- `api` publica
- PostgreSQL
- Redis
- storage persistente
- webhook real de Telegram

## Recursos requeridos en Coolify

Crear en el mismo proyecto:

- `PostgreSQL`
- `Redis`
- `Application` para `api`
- `Application` para `web`

## Aplicacion API

- repositorio: el repo actual
- rama: `main`
- build pack: `Dockerfile`
- dockerfile: `/apps/api/Dockerfile`
- puerto expuesto: `4000`
- dominio: `https://api.204.168.253.8.sslip.io`

### Variables minimas API

- `NODE_ENV=production`
- `PORT=4000`
- `API_BASE_URL=https://api.204.168.253.8.sslip.io`
- `WEB_BASE_URL=https://app.204.168.253.8.sslip.io`
- `DATABASE_URL=<internal postgres url>`
- `REDIS_URL=<internal redis url>`
- `JWT_ACCESS_SECRET=<secreto largo>`
- `JWT_REFRESH_SECRET=<secreto largo distinto>`
- `TELEGRAM_BOT_TOKEN=<token real>`
- `TELEGRAM_API_BASE=https://api.telegram.org`
- `MINIO_ENDPOINT=<endpoint storage>`
- `MINIO_PORT=<puerto storage>`
- `MINIO_ACCESS_KEY=<access key>`
- `MINIO_SECRET_KEY=<secret key>`
- `MINIO_BUCKET=bellotas`
- `MINIO_REGION=us-east-1`
- `STORAGE_FORCE_PATH_STYLE=true`

## Aplicacion Web

- repositorio: el repo actual
- rama: `main`
- build pack: `Dockerfile`
- dockerfile: `/apps/web/Dockerfile`
- puerto expuesto: `3000`
- dominio: `https://app.204.168.253.8.sslip.io`

### Variables minimas Web

- `NODE_ENV=production`
- `NEXT_PUBLIC_API_BASE_URL=https://api.204.168.253.8.sslip.io/api`

## Post-deploy obligatorio

En la terminal de la app `api` ejecutar:

```bash
pnpm exec prisma db push --schema prisma/schema.prisma
pnpm seed
```

## Webhook real de Telegram

Registrar:

```text
https://api.204.168.253.8.sslip.io/api/telegram/webhook/demo-logistica
```

Comprobacion recomendada:

```bash
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

## Validaciones minimas antes de abrir piloto

- `GET /api/health` responde `ok: true`
- login web `ADMIN001`, `MGR001`, `RRHH001`
- `manager` recibe `403` en `/api/settings`
- alta de empleado devuelve PIN temporal
- reset de PIN funciona
- Telegram:
  - login con PIN temporal
  - cambio obligatorio de PIN
  - recordatorio simple
  - foto/documento
- validacion de nominas funciona
- envio manual de nominas funciona

## Nota de alcance

Este documento asume:

- piloto en servidor estable, no tunel temporal
- sin API key real de IA todavia
- sin WhatsApp
- sin n8n
