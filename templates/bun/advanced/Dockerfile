# syntax=docker/dockerfile:1.7
FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 circe && adduser --system --uid 1001 circe
COPY --from=deps --chown=circe:circe /app/node_modules ./node_modules
COPY --chown=circe:circe . .
USER circe
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["bun", "run", "start"]

