FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web ./apps/web
RUN pnpm install --filter @bellotas/web... --no-frozen-lockfile
WORKDIR /app/apps/web
RUN pnpm build
CMD ["pnpm", "start"]
