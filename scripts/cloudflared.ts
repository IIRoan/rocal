#!/usr/bin/env bun

import { createLogger } from "@workspace/logger";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_CLOUDFLARED_TUNNEL_NAME = "rocal";
const DEFAULT_CLOUDFLARED_CONFIG = join(homedir(), ".cloudflared", "config.yml");
const STARTUP_GRACE_PERIOD_MS = 2_000;
const log = createLogger("cloudflared");

function fail(message: string): never {
  log.error(message);
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ManagedProcess = {
  exited: Promise<number>;
  kill(): void;
};

async function ensureProcessStaysUp(
  proc: ManagedProcess,
  name: string,
): Promise<void> {
  const result = await Promise.race([
    proc.exited.then((code) => ({ type: "exited", code })),
    sleep(STARTUP_GRACE_PERIOD_MS).then(() => ({ type: "running" })),
  ]);

  if (result.type === "exited") {
    fail(`${name} exited too early with code ${result.code}.`);
  }
}

const tunnelToken = process.env.CLOUDFLARED_TUNNEL_TOKEN?.trim();
const tunnelName =
  process.env.CLOUDFLARED_TUNNEL_NAME?.trim() || DEFAULT_CLOUDFLARED_TUNNEL_NAME;
const configPath =
  process.env.CLOUDFLARED_CONFIG?.trim() || DEFAULT_CLOUDFLARED_CONFIG;

const cloudflaredCheck = Bun.spawnSync(["cloudflared", "--version"], {
  stdout: "ignore",
  stderr: "ignore",
});

if (cloudflaredCheck.exitCode !== 0) {
  fail("cloudflared is not installed or not available in PATH.");
}

let tunnelCommand;
if (tunnelToken) {
  tunnelCommand = ["cloudflared", "tunnel", "run", "--token", tunnelToken];
} else {
  if (!existsSync(configPath)) {
    fail(
      `Cloudflare config was not found at ${configPath}. Set CLOUDFLARED_CONFIG or CLOUDFLARED_TUNNEL_TOKEN.`,
    );
  }
  tunnelCommand = ["cloudflared", "tunnel", "--config", configPath, "run", tunnelName];
}

log.step(
  tunnelToken
    ? "Starting Cloudflare tunnel with CLOUDFLARED_TUNNEL_TOKEN."
    : `Starting Cloudflare tunnel '${tunnelName}' via ${configPath}.`,
);

const tunnelProc = Bun.spawn(tunnelCommand, {
  cwd: process.cwd(),
  env: process.env,
  stdin: "ignore",
  stdout: "inherit",
  stderr: "inherit",
});

await ensureProcessStaysUp(tunnelProc, "cloudflared");
log.ok("Cloudflare tunnel is running.");

let cleanedUp = false;
const cleanup = (): void => {
  if (cleanedUp) return;
  cleanedUp = true;
  tunnelProc.kill();
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(0);
  });
}

const code = await tunnelProc.exited;
fail(`Cloudflare tunnel exited unexpectedly with code ${code}.`);
