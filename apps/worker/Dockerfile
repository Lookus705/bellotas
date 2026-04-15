FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --filter @bellotas/worker... --no-frozen-lockfile
RUN mkdir -p ./apps/worker/prisma && cp ./apps/api/prisma/schema.prisma ./apps/worker/prisma/schema.prisma
RUN pnpm --dir ./apps/worker exec prisma generate --schema ./prisma/schema.prisma
WORKDIR /app/apps/worker
RUN pnpm build
CMD ["node", "dist/main.js"]
