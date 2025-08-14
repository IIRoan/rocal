# syntax=docker/dockerfile:1
# --------------------------------------------------
# 1.  Base (all stages inherit from here)
# --------------------------------------------------
    FROM oven/bun:1-alpine AS base
    RUN apk add --no-cache libc6-compat         # make node-gyp happy
    WORKDIR /app
    
    # --------------------------------------------------
    # 2.  Install all node_modules once (monorepo)
    # --------------------------------------------------
    FROM base AS deps
    COPY package.json bun.lock ./
    COPY apps/backend/package.json  ./apps/backend/
    COPY apps/web/package.json      ./apps/web/
    # copy every other workspace so bun knows about them
    COPY packages/**/package.json ./packages/*/
    RUN bun install --frozen-lockfile
    
    # --------------------------------------------------
    # 3.  Builder – compile all TypeScript
    # --------------------------------------------------
    FROM deps AS builder
    COPY . .
    
    # generate Prisma client (if it exists)
    RUN if [ -f "apps/backend/prisma/schema.prisma" ]; then \
          cd apps/backend && \
          bunx prisma generate; \
        fi
    
    RUN bunx turbo build --filter=web --no-daemon
    
    # optional: prune out dev files and deps
    RUN bunx turbo prune --scope=web --docker
    
    # --------------------------------------------------
    # 4.  Runtime – smallest possible image
    # --------------------------------------------------
    FROM base AS runner
    RUN addgroup --system --gid 1001 nodejs && \
        adduser --system --uid 1001 nextjs
    
    ENV NODE_ENV=production \
        NEXT_TELEMETRY_DISABLED=1 \
        HOSTNAME=0.0.0.0 \
        PORT=3000
    
    # copy production node_modules
    COPY --from=builder --chown=nextjs:nodejs \
         /app/out/json ./package.json
    COPY --from=builder --chown=nextjs:nodejs \
         /app/out/apps/web ./apps/web
    COPY --from=builder --chown=nextjs:nodejs \
         /app/out/apps/backend ./apps/backend
    COPY --from=builder --chown=nextjs:nodejs \
         /app/out/bun.lock ./
    RUN bun install --frozen-lockfile --production
    
    # copy compiled app
    COPY --from=builder --chown=nextjs:nodejs \
         /app/apps/web/.next/standalone ./apps/web
    COPY --from=builder --chown=nextjs:nodejs \
         /app/apps/web/.next/static ./apps/web/.next/static
    COPY --from=builder --chown=nextjs:nodejs \
         /app/apps/web/public ./apps/web/public
    
    USER nextjs
    EXPOSE 3000
    CMD ["node", "apps/web/server.js"]