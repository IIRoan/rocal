FROM docker.io/oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS bun

FROM docker.io/library/node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /source
COPY . .
RUN bun install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1 SOLACE_SELF_HOSTED=1
ENV NEXT_PUBLIC_API_URL=https://api.solace.onl \
    NEXT_PUBLIC_APP_URL=https://solace.onl \
    NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL=app.solace.onl://api/auth
ENV SOLACE_APPLE_TEAM_ID=HXJACWP87H STALWART_ADMIN_URL=https://mail.solace.onl/admin/
RUN cd apps/web && bun run build

RUN node <<'JS'
const { headers } = require("./apps/web/.next/routes-manifest.json");
const policy = headers.flatMap(route => route.headers)
  .find(header => header.key.toLowerCase() === "content-security-policy")?.value;
const connect = policy?.split(";").map(directive => directive.trim())
  .find(directive => directive.startsWith("connect-src "))?.split(" ");
if (!connect?.includes(process.env.NEXT_PUBLIC_API_URL)) {
  throw new Error("The production frontend cannot connect to the Solace API");
}
JS

FROM bun AS runtime
ADD --checksum=sha256:5e531967a8585233b37a989dad584b3cd2484bfdf6ecf1558a7c0c840469ada0 https://github.com/nextrs-sh/nextrs/releases/download/v0.1.0-rc.2/nextrs-v0.1.0-rc.2-linux-x86_64.tar.gz /tmp/nextrs.tar.gz
RUN tar -xzf /tmp/nextrs.tar.gz -C /usr/local/bin --strip-components=1 nextrs-v0.1.0-rc.2-linux-x86_64/nextrs && rm /tmp/nextrs.tar.gz
WORKDIR /app/apps/web
COPY --from=build --chown=65534:65534 /source/apps/web/.next/standalone/ /app/
COPY --from=build --chown=65534:65534 /source/apps/web/.next/static/ .next/static/
COPY --from=build --chown=65534:65534 /source/apps/web/public/ public/
RUN mkdir -p node_modules && ln -sf ../../../node_modules/next node_modules/next
USER 65534:65534
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
ENTRYPOINT ["/usr/local/bin/nextrs"]
CMD ["start", "/app/apps/web", "--js-runtime", "embedded-v8", "--isolates", "2", "--host", "0.0.0.0", "--port", "3000", "--trusted-proxy", "10.42.0.0/16"]
