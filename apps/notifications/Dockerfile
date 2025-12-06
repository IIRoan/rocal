# Use Node Alpine as base image
FROM node:20-alpine AS base

# Builder stage - install dependencies and build
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files for monorepo support
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

# Copy the notifications app package.json
COPY apps/notifications/package.json ./apps/notifications/

# Copy any workspace packages that might be needed
COPY packages ./packages/
# Install dependencies (will install for entire workspace)
RUN pnpm install --frozen-lockfile --filter notifications...

# Copy notifications app source
COPY apps/notifications ./apps/notifications/

WORKDIR /app/apps/notifications

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
COPY --from=builder --chown=notifications:nodejs /app/apps/notifications/node_modules ./node_modules
COPY --from=builder --chown=notifications:nodejs /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder --chown=notifications:nodejs /app/apps/notifications/server.ts ./
COPY --from=builder --chown=notifications:nodejs /app/apps/notifications/package.json ./
COPY --from=builder --chown=notifications:nodejs /app/apps/notifications/prisma ./prisma
COPY --from=builder --chown=notifications:nodejs /app/apps/notifications/emails ./emails

# Set correct permissions
RUN chown -R notifications:nodejs /app

USER notifications

EXPOSE 3001

CMD ["node", "--import", "tsx", "server.ts"]