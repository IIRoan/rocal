# Use Bun Alpine as base image
FROM oven/bun:1-alpine AS base

# Builder stage - install dependencies and build
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

# Install turbo globally
RUN bun add -g turbo

# Copy package files first for better layer caching
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ ./packages/

# Install all dependencies
RUN bun install

# Copy source code
COPY . .

# Generate Prisma client with optimized binary targets for production
RUN if [ -f "apps/backend/prisma/schema.prisma" ]; then \
    cd apps/backend && \
    bun add -g prismabox && \
    PRISMA_BINARY_TARGETS="debian-openssl-3.0.x" bun run db:generate; \
fi

# Build the web app using turbo
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
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Copy public files if they exist
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Copy Prisma generated files if they exist (create empty directories if source doesn't exist)
RUN mkdir -p /app/apps/backend
COPY --from=builder /app/apps/backend ./apps/backend

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]