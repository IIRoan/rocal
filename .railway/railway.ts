import {
  bucket,
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
  // Web (Next.js) runs on Vercel (apps/web); the Vercel API project was deleted on 2026-10-18.
  // The Rust API (plan 001) serves api.solace.onl (a custom domain, set outside this file).
  const solaceRepo = github("IIRoan/rocal", {
    branch: "master",
    checkSuites: false,
  });
  const stalwartRepo = github("IIRoan/rocal", {
    branch: "master",
    checkSuites: false,
    rootDirectory: "apps/stalwart",
  });

  // PGDATA is …/pgdata18 (set via CLI); …/pgdata is the pre-upgrade PG17 cluster, kept for rollback.
  const postgresApp = postgres("Postgres", { region: "europe-west4-drams3a" });
  postgresApp.networking = {
    privateNetworkEndpoint: "postgres",
    tcpProxies: { "5432": {} },
  };
  const postgresStalwart = postgres("Postgres-stalwart", {
    region: "europe-west4-drams3a",
  });
  postgresStalwart.networking = {
    privateNetworkEndpoint: "postgres-stalwart",
    tcpProxies: { "5432": {} },
  };

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
  const stalwartBlobs = bucket("stalwart-blobs", { region: "ams" });
  const stalwartRedis = service("Redis-stalwart", {
    source: image("redis:8.10.3-alpine@sha256:896f241f438ab6a210cfb24f573b84bea721a4cbe67f1b4fd07eb638b3b02a7b"),
    start: 'sh -ec \'exec redis-server --bind 0.0.0.0 :: --protected-mode yes --requirepass "$REDIS_PASSWORD" --save "" --appendonly no --maxmemory 256mb --maxmemory-policy noeviction\'',
    replicas: { "europe-west4-drams3a": 1 },
    networking: { privateNetworkEndpoint: "redis-stalwart" },
    deploy: {
      overlapSeconds: 0,
      drainingSeconds: 5,
      restartPolicyType: "ALWAYS",
      limitOverride: { containers: { cpu: 1, memoryBytes: 500000000 } },
    },
    env: {
      REDIS_PASSWORD: preserve(),
      REDIS_URL: "redis://:${{REDIS_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:6379/0",
    },
  });
  // Private; the API serves uploaded profile pictures through /api/profiles/avatars/:id.
  const profilePictures = bucket("profile-pictures", { region: "ams" });
  const gatusData = volume("gatus-data", {
    region: "europe-west4-drams3a",
    sizeMB: 1000,
  });

  const monitoring = service("Monitoring", {
    source: github("IIRoan/rocal", {
      branch: "master",
      checkSuites: false,
      rootDirectory: "apps/gatus",
    }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: ["apps/gatus/**"],
    },
    start: "/usr/local/bin/entrypoint.sh",
    healthcheck: "/health",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    volumeMounts: { "/data": gatusData },
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      limitOverride: { containers: { cpu: 1, memoryBytes: 250000000 } },
    },
    domains: [
      { domain: "status.solace.onl", port: 8080 },
      { domain: "monitoring-solace.roan.dev", port: 8080 },
    ],
    env: {
      DISCORD_WEBHOOK_URL: preserve(),
      GATUS_CONFIG_PATH: "/data/config.yaml",
      PORT: "8080",
      TZ: "Europe/Amsterdam",
      prometheus_password: preserve(),
      prometheus_user: preserve(),
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
    networking: { privateNetworkEndpoint: "stalwart" },
    deploy: {
      ipv6EgressEnabled: true,
      drainingSeconds: 120,
      overlapSeconds: 90,
    },
    env: {
      BUCKET: ref(stalwartBlobs, "BUCKET"),
      BUCKET_ACCESS_KEY_ID: ref(stalwartBlobs, "ACCESS_KEY_ID"),
      // Stalwart's store uses the path-style endpoint, not the bucket's virtual-host one.
      BUCKET_ENDPOINT: preserve(),
      BUCKET_REGION: ref(stalwartBlobs, "REGION"),
      BUCKET_SECRET_ACCESS_KEY: ref(stalwartBlobs, "SECRET_ACCESS_KEY"),
      FRPC_RELAY_STCP_KEY: preserve(),
      FRPC_SHA256: preserve(),
      FRPC_SLOT: preserve(),
      // The frp mutual-TLS client certificate (railway-entrypoint.sh); kept through applies once set.
      FRPC_TLS_CA: preserve(),
      FRPC_TLS_CERT: preserve(),
      FRPC_TLS_KEY: preserve(),
      FRPC_TOKEN: preserve(),
      FRPC_VERSION: preserve(),
      FRPS_ADDR: preserve(),
      PGDATABASE: "stalwart_v1",
      PGHOST: ref(postgresStalwart, "PGHOST"),
      PGPASSWORD: ref(postgresStalwart, "PGPASSWORD"),
      PGPORT: ref(postgresStalwart, "PGPORT"),
      PGUSER: ref(postgresStalwart, "PGUSER"),
      PORT: preserve(),
      SLOT_MANAGER_TOKEN: preserve(),
      STALWART_ADMIN_TOKEN: preserve(),
      STALWART_GATE_KEY: preserve(),
      STALWART_RECOVERY_MODE: preserve(),
      STALWART_REDIS_URL: ref(stalwartRedis, "REDIS_URL"),
      STALWART_TOKEN: preserve(),
    },
  });

  // The reference as Railway stores it: `ref()` writes the service name quoted, then reads that back as a change on every plan.
  const fromApi = (name: string) => `\${{"Solace API".${name}}}`;
  const api = service("Solace API", {
    source: solaceRepo,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/backend/Dockerfile",
      buildEnvironment: "V3",
      watchPatterns: [
        "apps/backend/**",
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
      restartPolicyMaxRetries: 5,
    },
    // Boot re-registers Stalwart's webhook with STALWART_WEBHOOK_SECRET.
    env: {
      NODE_ENV: "production",
      DATABASE_URL: ref(postgresApp, "DATABASE_URL"),
      // Cookies cross from solace.onl to api.solace.onl, and the Vercel web URL is trusted too.
      AUTH_COOKIE_SAME_SITE: "none",
      AVATAR_BUCKET: ref(profilePictures, "BUCKET"),
      AVATAR_BUCKET_ACCESS_KEY_ID: ref(profilePictures, "ACCESS_KEY_ID"),
      AVATAR_BUCKET_ENDPOINT: ref(profilePictures, "ENDPOINT"),
      AVATAR_BUCKET_REGION: ref(profilePictures, "REGION"),
      AVATAR_BUCKET_SECRET_ACCESS_KEY: ref(
        profilePictures,
        "SECRET_ACCESS_KEY",
      ),
      BACKEND_URL: "https://api.solace.onl",
      BETTER_AUTH_SECRET: preserve(),
      EMAIL_FROM: preserve(),
      EMAIL_FROM_NAME: preserve(),
      FRONTEND_URL: "https://solace.onl",
      MAIL_BRIDGE_HMAC_KEY: preserve(),
      MOBILE_AUTH_CALLBACK_URL: preserve(),
      SENTRY_DSN:
        "https://65f1ae513c4a4865bc3b3384ce746653@errors.solace.onl/solace",
      // The same Stalwart admin token the server itself is configured with.
      STALWART_ADMIN_TOKEN: ref(stalwartMail, "STALWART_ADMIN_TOKEN"),
      STALWART_BASE_URL: "https://mail.solace.onl",
      STALWART_DEFAULT_DOMAIN: "solace.onl",
      STALWART_JMAP_PASSWORD: preserve(),
      STALWART_JMAP_USERNAME: preserve(),
      STALWART_WEBHOOK_SECRET: preserve(),
      STALWART_WEBHOOK_URL: preserve(),
      TRUSTED_ORIGINS: "https://solace-web.vercel.app",
    },
  });

  // The Rust worker; it replaced the Go "Solace Fiber Notification service" on 2026-10-17.
  const notifications = service("notifications-rust", {
    source: solaceRepo,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/notifications/Dockerfile",
      buildEnvironment: "V3",
      // The worker compiles against the API crate, so its sources count too.
      watchPatterns: [
        "apps/notifications/**",
        "apps/backend/**",
        "crates/**",
        "Cargo.toml",
        "Cargo.lock",
        "rust-toolchain.toml",
        "packages/calendar-core/src/redaction-policy.js",
        "packages/calendar-ics/src/windows-zones.json",
      ],
    },
    healthcheck: "/health",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    deploy: {
      ipv6EgressEnabled: true,
      restartPolicyMaxRetries: 5,
    },
    // The noreply identity, URLs and mode are the API's; only APNs is the worker's own.
    env: {
      APNS_AUTH_KEY: preserve(),
      APNS_KEY_ID: preserve(),
      APNS_TEAM_ID: preserve(),
      DATABASE_URL: ref(postgresApp, "DATABASE_URL"),
      EMAIL_FROM: fromApi("EMAIL_FROM"),
      EMAIL_FROM_NAME: fromApi("EMAIL_FROM_NAME"),
      FRONTEND_URL: fromApi("FRONTEND_URL"),
      NODE_ENV: fromApi("NODE_ENV"),
      STALWART_BASE_URL: fromApi("STALWART_BASE_URL"),
      STALWART_JMAP_PASSWORD: fromApi("STALWART_JMAP_PASSWORD"),
      STALWART_JMAP_USERNAME: fromApi("STALWART_JMAP_USERNAME"),
    },
  });

  const apiGroup = group("API", [api]);
  const mailServer = group("Mail server", [stalwartMail, postgresStalwart, stalwartRedis]);
  const notificationGroup = group("Notifications", [notifications]);

  return project("Solace", {
    variables: { managed: true },
    resources: [
      postgresApp,
      postgresVolume,
      postgresStalwartVolume,
      stalwartBlobs,
      profilePictures,
      monitoring,
      apiGroup,
      mailServer,
      notificationGroup,
    ],
  });
});
