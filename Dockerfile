# Use Bun Alpine as base image
FROM oven/bun:1-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

# Bun is already installed in the base image

WORKDIR /app

# Copy the entire monorepo for dependency resolution
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/backend/package.json ./apps/backend/
COPY packages/ ./packages/

# Install dependencies
RUN bun install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy source code (excluding node_modules via .dockerignore)
COPY . .

# Install dependencies
RUN bun install --frozen-lockfile

# Generate Prisma client
WORKDIR /app/apps/backend
RUN bun run db:generate

# Build the web app
WORKDIR /app
ENV npm_config_user_config=/dev/null
ENV npm_config_cache=/tmp/.npm
RUN TURBO_DOWNLOAD_LOCAL_ENABLED=0 bunx --bun turbo build --filter=web

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the public folder
# COPY --from=builder /app/apps/web/public ./apps/web/public

# Set the correct permission for prerender cache
RUN mkdir -p /app/apps/web/.next
RUN chown nextjs:nodejs /app/apps/web/.next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Copy Prisma generated files and schema
COPY --from=builder /app/apps/backend/generated ./apps/backend/generated
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "apps/web/server.js"]