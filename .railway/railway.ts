import {
  bucket,
  defineRailway,
  github,
  group,
  postgres,
  preserve,
  project,
  ref,
  service,
  volume,
} from "railway/iac";

export default defineRailway(() => {
  // Web (Next.js) and the TypeScript API (Elysia) run on Vercel; see apps/web + apps/backend vercel.json.
  // The Rust API (plan 001) runs here without a domain until api.solace.onl moves to it.
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
  // Private; the API serves uploaded profile pictures through /api/profiles/avatars/:id.
  const profilePictures = bucket("profile-pictures", { region: "ams" });

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
      BUCKET: preserve(),
      BUCKET_ACCESS_KEY_ID: preserve(),
      BUCKET_ENDPOINT: preserve(),
      BUCKET_REGION: preserve(),
      BUCKET_SECRET_ACCESS_KEY: preserve(),
      FRPC_RELAY_STCP_KEY: preserve(),
      FRPC_SLOT: preserve(),
      FRPC_TOKEN: preserve(),
      FRPS_ADDR: preserve(),
      PGDATABASE: preserve(),
      PGHOST: preserve(),
      PGPASSWORD: preserve(),
      PGPORT: preserve(),
      PGUSER: preserve(),
      PORT: preserve(),
      SLOT_MANAGER_TOKEN: preserve(),
      STALWART_ADMIN_TOKEN: preserve(),
      STALWART_GATE_KEY: preserve(),
      STALWART_RECOVERY_MODE: preserve(),
      STALWART_TOKEN: preserve(),
    },
  });

  const notifications = service("Solace Fiber Notification service", {
    source: solaceRepo,
    build: {
      builder: "RAILPACK",
      buildCommand: "bun install && bun run build:notifications",
      buildEnvironment: "V3",
      watchPatterns: ["apps/notifications/**", "bun.lock", "package.json"],
    },
    start: "bun run start:notifications",
    healthcheck: "/health",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    networking: { privateNetworkEndpoint: "notification-service" },
    deploy: {
      ipv6EgressEnabled: true,
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
      RAILPACK_PACKAGES: preserve(),
      STALWART_JMAP_PASSWORD: preserve(),
      STALWART_JMAP_URL: preserve(),
      STALWART_JMAP_USERNAME: preserve(),
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
    // The same variables as the Vercel API; STALWART_WEBHOOK_SECRET waits for cutover, since boot re-registers the webhook with it.
    env: {
      NODE_ENV: "production",
      // Off until api.solace.onl points here: Vercel still serves manual syncs, and synced events have no unique key.
      CALENDAR_SYNC: "false",
      DATABASE_URL: ref(postgresApp, "DATABASE_URL"),
      AUTH_COOKIE_SAME_SITE: preserve(),
      AVATAR_BUCKET: ref(profilePictures, "BUCKET"),
      AVATAR_BUCKET_ACCESS_KEY_ID: ref(profilePictures, "ACCESS_KEY_ID"),
      AVATAR_BUCKET_ENDPOINT: ref(profilePictures, "ENDPOINT"),
      AVATAR_BUCKET_REGION: ref(profilePictures, "REGION"),
      AVATAR_BUCKET_SECRET_ACCESS_KEY: ref(profilePictures, "SECRET_ACCESS_KEY"),
      BACKEND_URL: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      EMAIL_FROM: preserve(),
      EMAIL_FROM_NAME: preserve(),
      FRONTEND_URL: preserve(),
      MAIL_BRIDGE_HMAC_KEY: preserve(),
      MOBILE_AUTH_CALLBACK_URL: preserve(),
      NEXT_PUBLIC_APP_URL: "https://solace.onl",
      SENTRY_DSN: "https://65f1ae513c4a4865bc3b3384ce746653@errors.solace.onl/solace",
      STALWART_ADMIN_TOKEN: preserve(),
      STALWART_BASE_URL: preserve(),
      STALWART_DEFAULT_DOMAIN: preserve(),
      STALWART_JMAP_PASSWORD: preserve(),
      STALWART_JMAP_URL: preserve(),
      STALWART_JMAP_USERNAME: preserve(),
      STALWART_WEBHOOK_SECRET: preserve(),
      STALWART_WEBHOOK_URL: preserve(),
      TRUSTED_ORIGINS: preserve(),
    },
  });

  const apiGroup = group("API", [api]);
  const mailServer = group("Mail server", [stalwartMail, postgresStalwart]);
  const notificationGroup = group("Notifications", [notifications]);

  return project("Solace", {
    variables: { managed: true },
    resources: [
      postgresApp,
      postgresVolume,
      postgresStalwartVolume,
      stalwartBlobs,
      profilePictures,
      apiGroup,
      mailServer,
      notificationGroup,
    ],
  });
});
