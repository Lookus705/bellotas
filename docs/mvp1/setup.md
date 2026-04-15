# Setup local

## Requisitos

- Docker Desktop
- archivo `.env` derivado de `.env.example`

## Levantar stack

```bash
docker compose up --build
```

## Migraciones y seed

```bash
docker compose exec api pnpm prisma:migrate
docker compose exec api pnpm seed
```

## Accesos demo

- manager: `MGR001 / 1234`
- rrhh: `RRHH001 / 1234`
- chofer: `DRV001 / 1234`
- almacenista: `ALM001 / 1234`

## URLs

- web: `http://localhost:3001`
- api: `http://localhost:4000/api`
- mailhog: `http://localhost:8025`
- minio: `http://localhost:9001`
