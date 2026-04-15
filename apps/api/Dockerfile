FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --filter @bellotas/api... --no-frozen-lockfile
WORKDIR /app/apps/api
RUN pnpm prisma:generate
RUN pnpm build
CMD ["sh", "-c", "pnpm prisma:generate && node dist/src/main.js"]
