# syntax=docker/dockerfile:1.7
FROM denoland/deno:alpine-2.2.0 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY deno.json ./
RUN deno install --entrypoint deno.json

COPY . .
RUN chown -R deno:deno /app
USER deno

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD deno eval "fetch('http://localhost:8080/health').then(r => r.ok ? Deno.exit(0) : Deno.exit(1)).catch(() => Deno.exit(1))"

CMD ["run", "-A", "npm:@sxnnyside/circe", "start"]

