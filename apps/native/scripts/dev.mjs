#!/usr/bin/env bun

import { createLogger } from "@workspace/logger";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_CLOUDFLARED_PUBLIC_URL = "https://cloudflared.roan.dev";
const DEFAULT_CLOUDFLARED_TUNNEL_NAME = "rocal";
const DEFAULT_CLOUDFLARED_CONFIG = join(homedir(), ".cloudflared", "config.yml");
const STARTUP_GRACE_PERIOD_MS = 2_000;
const log = createLogger("native:dev");

function fail(message) {
  log.error(message);
  process.exit(1);
}

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureProcessStaysUp(proc, name) {
  const result = await Promise.race([
    proc.exited.then((code) => ({ type: "exited", code })),
    sleep(STARTUP_GRACE_PERIOD_MS).then(() => ({ type: "running" })),
  ]);

  if (result.type === "exited") {
    fail(`${name} exited too early with code ${result.code}.`);
  }
}

const publicUrl = normalizeUrl(
  process.env.CLOUDFLARED_PUBLIC_URL || DEFAULT_CLOUDFLARED_PUBLIC_URL,
);
const tunnelToken = process.env.CLOUDFLARED_TUNNEL_TOKEN?.trim();
const tunnelName =
  process.env.CLOUDFLARED_TUNNEL_NAME?.trim() || DEFAULT_CLOUDFLARED_TUNNEL_NAME;
const configPath =
  process.env.CLOUDFLARED_CONFIG?.trim() || DEFAULT_CLOUDFLARED_CONFIG;
const shouldStartTunnel = process.env.NATIVE_DEV_AUTOSTART_TUNNEL !== "false";
const expoArgs = process.argv.slice(2);

const env = {
  ...process.env,
  EXPO_PUBLIC_API_URL: publicUrl,
  EXPO_PUBLIC_APP_URL: publicUrl,
  PASSKEY_ORIGIN: process.env.PASSKEY_ORIGIN?.trim() || publicUrl,
};

const tunnelCommand = (() => {
  if (!shouldStartTunnel) {
    return null;
  }

  const cloudflaredCheck = Bun.spawnSync(["cloudflared", "--version"], {
    stdout: "ignore",
    stderr: "ignore",
  });

  if (cloudflaredCheck.exitCode !== 0) {
    fail("cloudflared is not installed or not available in PATH.");
  }

  if (tunnelToken) {
    return ["cloudflared", "tunnel", "run", "--token", tunnelToken];
  }

  if (!existsSync(configPath)) {
    fail(
      `Cloudflare config was not found at ${configPath}. Set CLOUDFLARED_CONFIG or CLOUDFLARED_TUNNEL_TOKEN.`,
    );
  }

  return ["cloudflared", "tunnel", "--config", configPath, "run", tunnelName];
})();

log.info(`Forcing EXPO_PUBLIC_API_URL to ${env.EXPO_PUBLIC_API_URL}`);
log.info(`Forcing EXPO_PUBLIC_APP_URL to ${env.EXPO_PUBLIC_APP_URL}`);
log.info(`Forcing PASSKEY_ORIGIN to ${env.PASSKEY_ORIGIN}`);

let tunnelProc = null;
if (tunnelCommand) {
  log.step(
    tunnelToken
      ? "Starting Cloudflare tunnel with CLOUDFLARED_TUNNEL_TOKEN."
      : `Starting Cloudflare tunnel '${tunnelName}' via ${configPath}.`,
  );

  tunnelProc = Bun.spawn(tunnelCommand, {
    cwd: process.cwd(),
    env,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });

  await ensureProcessStaysUp(tunnelProc, "cloudflared");
  log.ok("Cloudflare tunnel is running.");
} else {
  log.skip("Skipping Cloudflare tunnel startup because NATIVE_DEV_AUTOSTART_TUNNEL=false.");
}

const expoCommand = [process.execPath, "x", "expo", "start", ...expoArgs];
log.step(`Starting Expo with: ${expoCommand.join(" ")}`);

const expoProc = Bun.spawn(expoCommand, {
  cwd: process.cwd(),
  env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

let cleanedUp = false;
const cleanup = () => {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;
  expoProc.kill();
  tunnelProc?.kill();
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(0);
  });
}

const processes = [
  expoProc.exited.then((code) => ({ name: "expo", code })),
  ...(tunnelProc
    ? [tunnelProc.exited.then((code) => ({ name: "cloudflared", code }))]
    : []),
];

const result = await Promise.race(processes);

if (result.name === "cloudflared") {
  cleanup();
  fail(`Cloudflare tunnel exited unexpectedly with code ${result.code}.`);
}

tunnelProc?.kill();
process.exit(result.code);
