# Use Bun Alpine as base image
FROM oven/bun:1-alpine AS base

FROM base AS builder
RUN apk update
RUN apk add --no-cache libc6-compat
# Set working directory
WORKDIR /app
# Install turbo globally using bun
RUN bun add -g turbo
COPY . .

# Generate a partial monorepo with a pruned lockfile for a target workspace.
RUN turbo prune web --docker

# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

# First install the dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
RUN bun install --frozen-lockfile

# Build the project
COPY --from=builder /app/out/full/ .
# Install prisma CLI and generate client if schema exists
RUN if [ -f "apps/backend/prisma/schema.prisma" ]; then \
    bun add -g prisma && \
    cd apps/backend && \
    prisma generate; \
fi
# Build the web app
WORKDIR /app
RUN bun run turbo build --filter=web

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir -p /app/apps/web/.next
RUN chown nextjs:nodejs /app/apps/web/.next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Copy Prisma generated files and schema
COPY --from=installer /app/apps/backend/generated ./apps/backend/generated
COPY --from=installer /app/apps/backend/prisma ./apps/backend/prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "apps/web/server.js"]