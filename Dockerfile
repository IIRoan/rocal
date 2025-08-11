# Use Bun Alpine as base image
FROM oven/bun:1-alpine AS base

# Builder stage - prune the monorepo
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

# Install turbo globally
RUN bun add -g turbo

# Copy everything for pruning
COPY . .

# Generate a partial monorepo with a pruned lockfile for the web workspace
RUN turbo prune web --docker

# Installer stage - install dependencies and build
FROM base AS installer
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

# Copy the pruned workspace (package.json files and lockfile)
COPY --from=builder /app/out/json/ .

# Install dependencies using bun
RUN bun install --frozen-lockfile

# Copy the pruned source code
COPY --from=builder /app/out/full/ .

# Generate Prisma client if needed
RUN if [ -f "apps/backend/prisma/schema.prisma" ]; then \
    cd apps/backend && \
    bun run db:generate; \
fi

# Install turbo in this stage
RUN bun add -g turbo

# Build the application using turbo
RUN turbo build --filter=web

# Runtime stage
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy the built application
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Copy public files if they exist
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Copy Prisma generated files if they exist
RUN mkdir -p /app/apps/backend
COPY --from=installer /app/apps/backend/generated ./apps/backend/generated || true
COPY --from=installer /app/apps/backend/prisma ./apps/backend/prisma || true

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]