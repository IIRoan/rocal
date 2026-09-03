import {
  bucket,
  database,
  defineRailway,
  github,
  group,
  postgres,
  preserve,
  project,
  service,
  volume,
} from "railway/iac";

export default defineRailway(() => {
  // Web (Next.js) and API (Elysia) run on Vercel — see apps/web + apps/backend vercel.json.
  // Postgres stays here so Vercel API can reach it via DATABASE_PUBLIC_URL.
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

  const postgresApp = database("Postgres", "postgres", {
    image: "ghcr.io/railwayapp-templates/postgres-ssl:17",
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
  const stalwartBlobs = bucket("stalwart-blobs", { region: "ams" });

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
      SLOT_MANAGER_TOKEN: preserve(),
      prometheus_password: preserve(),
      prometheus_user: preserve(),
    },
  });

  const mailServer = group("Mail server", [stalwartMail, postgresStalwart]);
  const notificationGroup = group("Notifications", [notifications]);
  const monitoringGroup = group("Monitoring", [monitoring]);

  return project("Solace", {
    resources: [
      mailServer,
      notificationGroup,
      monitoringGroup,
      postgresApp,
      postgresVolume,
      postgresStalwartVolume,
      monitoringVolume,
      stalwartBlobs,
    ],
  });
});
