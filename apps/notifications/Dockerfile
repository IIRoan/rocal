# Use Node Alpine as base image
FROM node:20-alpine AS base

# Builder stage - install dependencies and build
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml* ./
COPY prisma/ ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client with optimized binary targets for production
RUN PRISMA_BINARY_TARGETS="linux-musl-openssl-3.0.x" pnpm run prisma:generate

# Build the application
RUN pnpm run build

# Runtime stage
FROM base AS runner

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

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

CMD ["node", "--import", "tsx", "server.ts"]