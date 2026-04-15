# Arquitectura MVP 1

## Superficies

- `apps/api`: API NestJS con multitenancy, auth, Telegram, operaciones, incidencias y nominas.
- `apps/web`: panel Next.js para `manager` y `RRHH`.
- `apps/worker`: worker de notificaciones por email y Telegram.

## Flujo principal

1. Telegram recibe texto o audio.
2. El webhook identifica tenant por `tenantSlug`.
3. El usuario se autentica con `LOGIN CODIGO PIN`.
4. Si el usuario ya esta vinculado, se reutiliza `telegram_user_id`.
5. El mensaje se clasifica y se extraen campos minimos.
6. Si faltan datos, el sistema responde con una aclaracion.
7. Si los datos minimos estan completos, se persiste el reporte.
8. Si la incidencia es grave, se crean notificaciones pendientes.
9. El worker envia alertas por email y Telegram.

## Multitenancy

- todas las tablas de negocio tienen `tenantId`
- Telegram resuelve tenant por ruta de webhook
- web resuelve tenant desde el usuario autenticado
- archivos se almacenan por prefijo de tenant en MinIO
