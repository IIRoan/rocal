# Use Bun Alpine as base image
FROM oven/bun:1-alpine AS base

# Builder stage - install dependencies and build
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files first for better layer caching
COPY package.json bun.lockb* ./
COPY prisma/ ./prisma/

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Generate Prisma client with optimized binary targets for production
RUN PRISMA_BINARY_TARGETS="linux-musl-openssl-3.0.x" bun run prisma:generate

# Build the application
RUN bun run build

# Runtime stage
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 notifications

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# Copy the built application and generated Prisma client
COPY --from=builder --chown=notifications:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=notifications:nodejs /app/server.ts ./
COPY --from=builder --chown=notifications:nodejs /app/package.json ./
COPY --from=builder --chown=notifications:nodejs /app/prisma ./prisma
COPY --from=builder --chown=notifications:nodejs /app/emails ./emails

# Set correct permissions
RUN chown -R notifications:nodejs /app

USER notifications

EXPOSE 3001

CMD ["bun", "run", "start"]