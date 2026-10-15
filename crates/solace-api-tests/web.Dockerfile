# The web app as a Railway test service against a test API; never deployed to production.
FROM docker.io/oven/bun:1.4.3-debian@sha256:923bedb355f7746666659f71e724998159a5c8c54bd1cb1030e1975a0698415b
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile
# Next inlines NEXT_PUBLIC_* at build time; Railway passes the service variables as build arguments.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
WORKDIR /src/apps/web
RUN bun --bun run build
CMD ["bun", "run", "start"]
