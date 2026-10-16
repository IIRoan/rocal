import {
  bucket,
  database,
  defineRailway,
  github,
  group,
  image,
  postgres,
  preserve,
  project,
  ref,
  service,
  volume,
} from "railway/iac";

export default defineRailway(() => {
  // Web (Next.js) and API (Elysia) run on Vercel — see apps/web + apps/backend vercel.json.
  // Postgres stays here so Vercel API can reach it via DATABASE_PUBLIC_URL.
  // The Rust API (plan 001) runs here without a domain until api.solace.onl moves to it.
  const stalwartRepo = github("IIRoan/rocal", {
    branch: "master",
    rootDirectory: "apps/stalwart",
    checkSuites: false,
  });
  const gatusRepo = github("IIRoan/rocal", {
    branch: "master",
    rootDirectory: "apps/gatus",
    checkSuites: false,
  });
  const solaceRepo = github("IIRoan/rocal", {
    branch: "master",
    checkSuites: false,
  });

  // PGDATA is …/pgdata18 (set via CLI); …/pgdata is the pre-upgrade PG17 cluster, kept for rollback.
  const postgresApp = database("Postgres", "postgres", {
    image: "ghcr.io/railwayapp-templates/postgres-ssl:18",
    output: "DATABASE_URL",
    defaultMountPath: "/var/lib/postgresql/data",
    region: "europe-west4-drams3a",
  });
  const postgresStalwart = postgres("Postgres-stalwart", {
    region: "europe-west4-drams3a",
  });

  const postgresVolume = volume("postgres-volume", {
    region: "europe-west4-drams3a",
    sizeMB: 5000,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });
  const postgresStalwartVolume = volume("postgres-stalwart", {
    region: "europe-west4-drams3a",
    sizeMB: 5000,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });
  const monitoringVolume = volume("monitoring-volume", {
    region: "europe-west4-drams3a",
    sizeMB: 5000,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });
  const errexVolume = volume("errex-volume", {
    region: "europe-west4-drams3a",
    sizeMB: 1024,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });
  const stalwartBlobs = bucket("stalwart-blobs", { region: "ams" });
  // Private; the Vercel API serves uploaded profile pictures through /api/profiles/avatars/:id.
  const profilePictures = bucket("profile-pictures", { region: "ams" });

  const notifications = service("Solace Fiber Notification service", {
    source: solaceRepo,
    build: {
      buildCommand: "bun install && bun run build:notifications",
      watchPatterns: [
        "apps/notifications/**",
        "bun.lock",
        "package.json",
      ],
    },
    start: "bun run start:notifications",
    healthcheck: "/health",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    networking: { privateNetworkEndpoint: "notification-service" },
    deploy: {
      ipv6EgressEnabled: true,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
    env: {
      APNS_AUTH_KEY: preserve(),
      APNS_KEY_ID: preserve(),
      APNS_TEAM_ID: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      DATABASE_URL: preserve(),
      EMAIL_FROM: preserve(),
      EMAIL_FROM_NAME: preserve(),
      GITHUB_CLIENT_ID: preserve(),
      GITHUB_CLIENT_SECRET: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NODE_ENV: preserve(),
      RAILPACK_CONFIG_FILE: preserve(),
      RAILPACK_PACKAGES: "go",
      STALWART_JMAP_PASSWORD: preserve(),
      STALWART_JMAP_URL: preserve(),
      STALWART_JMAP_USERNAME: preserve(),
    },
  });

  const stalwartMail = service("stalwart-mail", {
    source: stalwartRepo,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      buildEnvironment: "V3",
      watchPatterns: ["apps/stalwart/**"],
    },
    healthcheck: "/healthz/ready",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    networking: {
      privateNetworkEndpoint: "stalwart",
      // Solace API only: the key-gated backend gate (apps/stalwart/backend-gate.cfg).
      serviceDomains: { "stalwart-mail-production.up.railway.app": { port: 8081 } },
    },
    deploy: {
      ipv6EgressEnabled: true,
      drainingSeconds: 120,
      // Old and new containers share the frp tunnel groups during overlap; keep it short.
      overlapSeconds: 10,
    },
    env: {
      BUCKET: preserve(),
      BUCKET_ACCESS_KEY_ID: preserve(),
      BUCKET_ENDPOINT: preserve(),
      BUCKET_REGION: preserve(),
      BUCKET_SECRET_ACCESS_KEY: preserve(),
      FRPC_RELAY_STCP_KEY: preserve(),
      FRPC_TLS_CA: preserve(),
      FRPC_TLS_CERT: preserve(),
      FRPC_TLS_KEY: preserve(),
      FRPC_TOKEN: preserve(),
      FRPS_ADDR: preserve(),
      PGDATABASE: preserve(),
      PGHOST: preserve(),
      PGPASSWORD: preserve(),
      PGPORT: preserve(),
      PGUSER: preserve(),
      PORT: preserve(),
      STALWART_ADMIN_TOKEN: preserve(),
      STALWART_GATE_KEY: preserve(),
      STALWART_MAIL_INGEST_WEBHOOK_SECRET: preserve(),
      STALWART_RECOVERY_MODE: preserve(),
      STALWART_TOKEN: preserve(),
    },
  });

  const monitoring = service("Monitoring", {
    source: gatusRepo,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      buildEnvironment: "V3",
      watchPatterns: ["apps/gatus/**"],
    },
    healthcheck: "/health",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    domains: [{ domain: "status.solace.onl", port: 8080 }],
    networking: { privateNetworkEndpoint: "monitoring" },
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
    },
    volumeMounts: {
      "/data": monitoringVolume,
    },
    env: {
      DISCORD_WEBHOOK_URL: preserve(),
      PORT: preserve(),
      prometheus_password: preserve(),
      prometheus_user: preserve(),
    },
  });

  // Self-hosted Sentry-compatible error tracker (https://github.com/TheHoltz/errex).
  // Deploys the official GHCR image (apps/errex holds operator docs + optional Dockerfile).
  // Set ERREX_ADMIN_TOKEN once after apply, then open /setup. SQLite is on /data/store.
  const errex = service("errex", {
    source: image("ghcr.io/theholtz/errex:latest", {
      autoUpdates: { type: "patch" },
    }),
    healthcheck: "/health",
    healthcheckTimeout: 100,
    replicas: { "europe-west4-drams3a": 1 },
    networking: { privateNetworkEndpoint: "errex" },
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
    },
    volumeMounts: {
      "/data": errexVolume,
    },
    env: {
      ERREX_ADMIN_TOKEN: preserve(),
      ERREX_DATA_DIR: "/data/store",
      ERREX_HOST: "0.0.0.0",
      ERREX_LOG_LEVEL: "info",
      ERREX_PUBLIC_URL: "https://errors.solace.onl",
      ERREX_REQUIRE_AUTH: "true",
      ERREX_RETENTION_DAYS: "30",
    },
  });

  const api = service("Solace API", {
    source: solaceRepo,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "crates/solace-server/Dockerfile",
      buildEnvironment: "V3",
      watchPatterns: [
        "crates/**",
        "Cargo.toml",
        "Cargo.lock",
        "rust-toolchain.toml",
        "packages/calendar-core/src/redaction-policy.js",
        "packages/calendar-ics/src/windows-zones.json",
      ],
    },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "europe-west4-drams3a": 1 },
    networking: { privateNetworkEndpoint: "solace-api" },
    deploy: {
      ipv6EgressEnabled: true,
      drainingSeconds: 30,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
    env: {
      NODE_ENV: "production",
      // Cookies, passkeys and the Stalwart webhook it re-registers at boot all use the public API URL.
      BACKEND_URL: "https://api.solace.onl",
      // Off until api.solace.onl points here: Vercel still serves manual syncs, and synced events have no unique key.
      CALENDAR_SYNC: "false",
      DATABASE_URL: ref(postgresApp, "DATABASE_URL"),
      AUTH_COOKIE_SAME_SITE: preserve(),
      AVATAR_BUCKET: preserve(),
      AVATAR_BUCKET_ACCESS_KEY_ID: preserve(),
      AVATAR_BUCKET_ENDPOINT: preserve(),
      AVATAR_BUCKET_REGION: preserve(),
      AVATAR_BUCKET_SECRET_ACCESS_KEY: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      EMAIL_FROM: preserve(),
      EMAIL_FROM_NAME: preserve(),
      FRONTEND_URL: preserve(),
      MAIL_BRIDGE_HMAC_KEY: preserve(),
      MOBILE_AUTH_CALLBACK_URL: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      PASSKEY_ORIGIN: preserve(),
      SENTRY_DSN: preserve(),
      STALWART_ADMIN_TOKEN: preserve(),
      STALWART_BASE_URL: preserve(),
      STALWART_DEFAULT_DOMAIN: preserve(),
      STALWART_GATE_KEY: preserve(),
      STALWART_JMAP_PASSWORD: preserve(),
      STALWART_JMAP_URL: preserve(),
      STALWART_JMAP_USERNAME: preserve(),
      STALWART_PROVISION_TOKEN: preserve(),
      STALWART_WEBHOOK_SECRET: preserve(),
      STALWART_WEBHOOK_URL: preserve(),
      TRUSTED_ORIGINS: preserve(),
    },
  });

  const mailServer = group("Mail server", [stalwartMail, postgresStalwart]);
  const apiGroup = group("API", [api]);
  const notificationGroup = group("Notifications", [notifications]);
  const monitoringGroup = group("Monitoring", [monitoring]);
  const errorTrackingGroup = group("Error tracking", [errex]);

  return project("Solace", {
    resources: [
      apiGroup,
      mailServer,
      notificationGroup,
      monitoringGroup,
      errorTrackingGroup,
      postgresApp,
      postgresVolume,
      postgresStalwartVolume,
      monitoringVolume,
      errexVolume,
      stalwartBlobs,
      profilePictures,
    ],
  });
});
