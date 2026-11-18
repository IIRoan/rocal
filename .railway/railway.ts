import { defineRailway, github, preserve, project, service, volume } from "railway/iac";

// Manage the status service while Railway holds offline recovery copies.
export const partial = "status";

export default defineRailway(() => {
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
      VPS_MONITOR_SSH_HOST: "mx.solace.onl",
      VPS_MONITOR_SSH_SECONDARY_HOST: "mx2.solace.onl",
      VPS_MONITOR_SSH_USERNAME: preserve(),
      VPS_MONITOR_SSH_PRIVATE_KEY_B64: preserve(),
      VPS_MONITOR_SSH_KNOWN_HOSTS: preserve(),
      prometheus_password: preserve(),
      prometheus_user: preserve(),
    },
  });

  return project("Solace", {
    resources: [monitoring],
  });
});
