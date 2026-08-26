import {
  bucket,
  defineRailway,
  empty,
  github,
  group,
  postgres,
  preserve,
  project,
  service,
  volume,
} from "railway/iac";

export default defineRailway(() => {
  const rocal = github("IIRoan/rocal", {
    branch: "master",
    checkSuites: false,
  });

  const postgresApp = postgres("Postgres", {
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
  const stalwartBlobs = bucket("stalwart-blobs", { region: "ams" });

  const web = service("Solace NextJS", {
    source: rocal,
    build: "bun install && bun run build:web",
    start: "cd apps/web && bunx serve out -p $PORT",
    healthcheck: "/",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    domains: [{ domain: "solace.onl", port: 8080 }],
    networking: { privateNetworkEndpoint: "rocal" },
    deploy: {
      ipv6EgressEnabled: true,
      sleepApplication: true,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
    env: {
      NEXT_PUBLIC_API_URL: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NODE_ENV: preserve(),
      STALWART_BASE_URL: preserve(),
      STALWART_DEFAULT_DOMAIN: preserve(),
    },
  });

  const api = service("Solace ElysiaJS", {
    source: rocal,
    build: {
      buildCommand: "bun install && bun run build:backend",
      watchPatterns: [
        "apps/backend/**",
        "packages/calendar-core/**",
        "packages/calendar-ics/**",
        "packages/logger/**",
        "packages/runtime/**",
        "packages/typescript-config/**",
        "bun.lock",
        "package.json",
      ],
    },
    start: "bun run start:backend",
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    replicas: { "europe-west4-drams3a": 1 },
    domains: [{ domain: "api.solace.onl", port: 8080 }],
    networking: { privateNetworkEndpoint: "backend" },
    deploy: {
      sleepApplication: true,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
    env: {
      AUTH_COOKIE_SAME_SITE: preserve(),
      AUTH_REDIRECT_URL: preserve(),
      AUTH_SKIP_STATE_COOKIE_CHECK: preserve(),
      BACKEND_URL: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      DATABASE_URL: preserve(),
      FRONTEND_URL: preserve(),
      GITHUB_CLIENT_ID: preserve(),
      GITHUB_CLIENT_SECRET: preserve(),
      MAIL_OAUTH_AUDIENCES: preserve(),
      MAIL_OAUTH_BROWSER_CLIENT_ID: preserve(),
      MAIL_OAUTH_BROWSER_REDIRECT_URIS: preserve(),
      MAIL_OAUTH_CLIENT_ID: preserve(),
      MAIL_OAUTH_REDIRECT_URIS: preserve(),
      MAIL_OAUTH_SCOPES: preserve(),
      MAIL_VAULT_HMAC_KEY: preserve(),
      MOBILE_AUTH_CALLBACK_URL: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NODE_ENV: preserve(),
      EMAIL_FROM: preserve(),
      EMAIL_FROM_NAME: preserve(),
      STALWART_ADMIN_TOKEN: preserve(),
      STALWART_BASE_URL: preserve(),
      STALWART_DEFAULT_DOMAIN: preserve(),
      STALWART_JMAP_URL: preserve(),
      STALWART_JMAP_USERNAME: preserve(),
      STALWART_JMAP_PASSWORD: preserve(),
      TRUSTED_ORIGINS: preserve(),
    },
  });

  const notifications = service("Solace Fiber Notification service", {
    source: rocal,
    build: {
      buildCommand: "bun install && bun run build:notifications",
      watchPatterns: ["apps/notifications"],
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
    source: github("IIRoan/stalwart", { checkSuites: false }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
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
      STALWART_RECOVERY_MODE: preserve(),
      STALWART_TOKEN: preserve(),
    },
  });

  const monitoring = service("Monitoring", {
    source: empty(),
    replicas: 0,
    domains: [{ domain: "status.solace.onl", port: 8080 }],
    networking: { privateNetworkEndpoint: "monitoring" },
    volumeMounts: {
      "/data": monitoringVolume,
    },
    env: {
      DISCORD_WEBHOOK_URL: preserve(),
      PORT: preserve(),
      SLOT_MANAGER_TOKEN: preserve(),
      prometheus_password: preserve(),
      prometheus_user: preserve(),
    },
  });

  const solace = group("Solace", [web, api]);
  const mailServer = group("Mail server", [stalwartMail, postgresStalwart]);
  const notificationGroup = group("Notifications", [notifications]);

  return project("Rocal", {
    resources: [
      solace,
      mailServer,
      notificationGroup,
      monitoring,
      postgresApp,
      postgresVolume,
      postgresStalwartVolume,
      monitoringVolume,
      stalwartBlobs,
    ],
  });
});
