FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @venture-pilot/participant-portal build

FROM nginx:1.27-alpine
COPY --from=build /repo/apps/participant-portal/dist /usr/share/nginx/html
COPY apps/participant-portal/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
