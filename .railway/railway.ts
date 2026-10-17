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
  // Web (Next.js) and the TypeScript API (Elysia) run on Vercel; see apps/web + retired/backend vercel.json.
  // The Rust API (plan 001) serves api.solace.onl (a custom domain, set outside this file); the Vercel API stays deployed for rollback.
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
      BUCKET: ref(stalwartBlobs, "BUCKET"),
      BUCKET_ACCESS_KEY_ID: ref(stalwartBlobs, "ACCESS_KEY_ID"),
      // Stalwart's store uses the path-style endpoint, not the bucket's virtual-host one.
      BUCKET_ENDPOINT: preserve(),
      BUCKET_REGION: ref(stalwartBlobs, "REGION"),
      BUCKET_SECRET_ACCESS_KEY: ref(stalwartBlobs, "SECRET_ACCESS_KEY"),
      FRPC_RELAY_STCP_KEY: preserve(),
      FRPC_SLOT: preserve(),
      FRPC_TOKEN: preserve(),
      FRPS_ADDR: preserve(),
      PGDATABASE: ref(postgresStalwart, "PGDATABASE"),
      PGHOST: ref(postgresStalwart, "PGHOST"),
      PGPASSWORD: ref(postgresStalwart, "PGPASSWORD"),
      PGPORT: ref(postgresStalwart, "PGPORT"),
      PGUSER: ref(postgresStalwart, "PGUSER"),
      PORT: preserve(),
      SLOT_MANAGER_TOKEN: preserve(),
      STALWART_ADMIN_TOKEN: preserve(),
      STALWART_GATE_KEY: preserve(),
      STALWART_RECOVERY_MODE: preserve(),
      STALWART_TOKEN: preserve(),
    },
  });

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
    // The same variables as the Vercel API; boot re-registers Stalwart's webhook with STALWART_WEBHOOK_SECRET.
    env: {
      NODE_ENV: "production",
      DATABASE_URL: ref(postgresApp, "DATABASE_URL"),
      // Read from the Vercel API's responses: its cookies are SameSite=None and it trusts the Vercel web URL.
      AUTH_COOKIE_SAME_SITE: "none",
      AVATAR_BUCKET: ref(profilePictures, "BUCKET"),
      AVATAR_BUCKET_ACCESS_KEY_ID: ref(profilePictures, "ACCESS_KEY_ID"),
      AVATAR_BUCKET_ENDPOINT: ref(profilePictures, "ENDPOINT"),
      AVATAR_BUCKET_REGION: ref(profilePictures, "REGION"),
      AVATAR_BUCKET_SECRET_ACCESS_KEY: ref(profilePictures, "SECRET_ACCESS_KEY"),
      BACKEND_URL: "https://api.solace.onl",
      BETTER_AUTH_SECRET: preserve(),
      EMAIL_FROM: preserve(),
      EMAIL_FROM_NAME: preserve(),
      FRONTEND_URL: "https://solace.onl",
      MAIL_BRIDGE_HMAC_KEY: preserve(),
      MOBILE_AUTH_CALLBACK_URL: preserve(),
      SENTRY_DSN: "https://65f1ae513c4a4865bc3b3384ce746653@errors.solace.onl/solace",
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
    networking: { privateNetworkEndpoint: "notifications-rust" },
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
      EMAIL_FROM: ref(api, "EMAIL_FROM"),
      EMAIL_FROM_NAME: ref(api, "EMAIL_FROM_NAME"),
      FRONTEND_URL: ref(api, "FRONTEND_URL"),
      NODE_ENV: ref(api, "NODE_ENV"),
      STALWART_BASE_URL: ref(api, "STALWART_BASE_URL"),
      STALWART_JMAP_PASSWORD: ref(api, "STALWART_JMAP_PASSWORD"),
      STALWART_JMAP_USERNAME: ref(api, "STALWART_JMAP_USERNAME"),
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
