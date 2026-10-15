# The current TypeScript backend as a Railway test service, for step 5's rollback drill; never built with build:vercel, which migrates production.
FROM docker.io/oven/bun:1.4.3-debian@sha256:923bedb355f7746666659f71e724998159a5c8c54bd1cb1030e1975a0698415b
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile --filter backend
WORKDIR /src/apps/backend
ENV TZ=UTC
CMD ["bun", "--no-env-file", "serve.ts"]
