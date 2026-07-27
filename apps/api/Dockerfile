# Copies the whole monorepo into the image rather than cherry-picking
# per-package build contexts. Simpler and correct for a low-operating-cost
# local/demo deployment; trades away some Docker layer-cache efficiency
# that a leaner multi-context setup would give a much larger team.
FROM node:22-slim

RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @venture-pilot/db generate

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["pnpm", "start"]
