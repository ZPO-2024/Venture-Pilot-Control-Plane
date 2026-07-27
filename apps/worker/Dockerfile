FROM node:22-slim

RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @venture-pilot/db generate

WORKDIR /repo/apps/worker
CMD ["pnpm", "start"]
