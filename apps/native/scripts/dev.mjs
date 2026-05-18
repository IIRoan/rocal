#!/usr/bin/env bun

import { createLogger } from "@workspace/logger";

const DEFAULT_CLOUDFLARED_PUBLIC_URL = "https://cloudflared.roan.dev";
const log = createLogger("native:dev");

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}

const publicUrl = normalizeUrl(
  process.env.CLOUDFLARED_PUBLIC_URL || DEFAULT_CLOUDFLARED_PUBLIC_URL,
);
const expoArgs = process.argv.slice(2);

const env = {
  ...process.env,
  EXPO_PUBLIC_API_URL: publicUrl,
  EXPO_PUBLIC_APP_URL: publicUrl,
  PASSKEY_ORIGIN: process.env.PASSKEY_ORIGIN?.trim() || publicUrl,
};

log.info(`Forcing EXPO_PUBLIC_API_URL to ${env.EXPO_PUBLIC_API_URL}`);
log.info(`Forcing EXPO_PUBLIC_APP_URL to ${env.EXPO_PUBLIC_APP_URL}`);
log.info(`Forcing PASSKEY_ORIGIN to ${env.PASSKEY_ORIGIN}`);

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
  if (cleanedUp) return;
  cleanedUp = true;
  expoProc.kill();
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(0);
  });
}

const code = await expoProc.exited;
process.exit(code);
