#!/usr/bin/env bun

import { createLogger } from "@workspace/logger";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { basename, dirname, extname, join, win32 } from "node:path";

const DEFAULT_CLOUDFLARED_TUNNEL_NAME = "rocal";
const STARTUP_GRACE_PERIOD_MS = 2_000;
const log = createLogger("cloudflared");

type CloudflaredBinaryKind = "native" | "windows";

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

type PreparedConfig = {
  localPath: string;
  commandPath: string;
  cleanup: () => void;
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

function readStdoutText(stdout: Uint8Array): string {
  return new TextDecoder().decode(stdout).trim();
}

function isWslEnvironment(): boolean {
  return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

function isWindowsPath(value: string): boolean {
  return /^[A-Za-z]:\\/.test(value);
}

function runTextCommand(command: string[]): string | null {
  let result;
  try {
    result = Bun.spawnSync(command, {
      stdout: "pipe",
      stderr: "ignore",
    });
  } catch {
    return null;
  }

  if (result.exitCode !== 0) {
    return null;
  }

  const text = readStdoutText(result.stdout);
  return text || null;
}

function resolveWindowsUserProfile(): string | null {
  return runTextCommand(["cmd.exe", "/C", "echo", "%UserProfile%"]);
}

function toWslPath(value: string): string {
  if (!isWslEnvironment() || !isWindowsPath(value)) {
    return value;
  }

  return runTextCommand(["wslpath", "-u", value]) || value;
}

function toWindowsPath(value: string): string {
  if (!isWslEnvironment() || isWindowsPath(value)) {
    return value;
  }

  return runTextCommand(["wslpath", "-w", value]) || value;
}

function resolveDefaultConfigPath(): string {
  const localDefault = join(homedir(), ".cloudflared", "config.yml");
  if (existsSync(localDefault)) {
    return localDefault;
  }

  if (!isWslEnvironment()) {
    return localDefault;
  }

  const windowsUserProfile = resolveWindowsUserProfile();
  if (!windowsUserProfile) {
    return localDefault;
  }

  const windowsConfigPath = win32.join(
    windowsUserProfile,
    ".cloudflared",
    "config.yml",
  );
  const wslConfigPath = toWslPath(windowsConfigPath);

  return existsSync(wslConfigPath) ? wslConfigPath : localDefault;
}

function resolveCloudflaredBinary(): {
  command: string;
  kind: CloudflaredBinaryKind;
} {
  const explicitCommand = process.env.CLOUDFLARED_BIN?.trim();
  const candidates = explicitCommand
    ? [explicitCommand]
    : isWslEnvironment()
      ? ["cloudflared", "cloudflared.exe"]
      : ["cloudflared"];

  for (const command of candidates) {
    let result;
    try {
      result = Bun.spawnSync([command, "--version"], {
        stdout: "ignore",
        stderr: "ignore",
      });
    } catch {
      continue;
    }

    if (result.exitCode === 0) {
      return {
        command,
        kind: command.toLowerCase().endsWith(".exe") ? "windows" : "native",
      };
    }
  }

  if (isWslEnvironment()) {
    fail(
      "cloudflared was not found in PATH. Install cloudflared in WSL, or install the Windows binary so the wrapper can use cloudflared.exe from WSL.",
    );
  }

  fail("cloudflared is not installed or not available in PATH.");
}

function resolveOriginHost(
  binaryKind: CloudflaredBinaryKind,
): string | undefined {
  const override = process.env.CLOUDFLARED_ORIGIN_HOST?.trim();
  if (override) {
    return override;
  }

  if (!(isWslEnvironment() && binaryKind === "windows")) {
    return undefined;
  }

  for (const iface of Object.values(networkInterfaces())) {
    for (const entry of iface ?? []) {
      if (
        entry.family === "IPv4" &&
        !entry.internal &&
        entry.address &&
        entry.address !== "127.0.0.1"
      ) {
        return entry.address;
      }
    }
  }

  fail(
    "Could not determine the WSL IPv4 address for Cloudflare tunnel origin rewriting. Set CLOUDFLARED_ORIGIN_HOST manually.",
  );
}

function normalizeConfigPath(pathValue: string): string {
  return isWslEnvironment() ? toWslPath(pathValue) : pathValue;
}

function rewritePathEntries(
  config: string,
  binaryKind: CloudflaredBinaryKind,
): string {
  return config.replace(
    /^(\s*(?:credentials-file|origincert):\s+)(.+)$/gm,
    (_, prefix: string, rawValue: string) => {
      const trimmedValue = rawValue.trim();
      const normalizedValue =
        binaryKind === "windows"
          ? toWindowsPath(trimmedValue)
          : normalizeConfigPath(trimmedValue);
      return `${prefix}${normalizedValue}`;
    },
  );
}

function rewriteOriginServices(config: string, originHost?: string): string {
  if (!originHost) {
    return config;
  }

  return config.replace(
    /^(\s*service:\s+https?:\/\/)(?:127\.0\.0\.1|localhost)(?=[:/])/gm,
    `$1${originHost}`,
  );
}

function buildTempConfigPath(sourcePath: string): string {
  const extension = extname(sourcePath) || ".yml";
  const stem = basename(sourcePath, extension);
  return join(dirname(sourcePath), `${stem}.runtime-${process.pid}${extension}`);
}

function prepareTunnelConfig(
  configPath: string,
  binaryKind: CloudflaredBinaryKind,
  originHost?: string,
): PreparedConfig {
  const localConfigPath = normalizeConfigPath(configPath);
  if (!existsSync(localConfigPath)) {
    fail(
      `Cloudflare config was not found at ${localConfigPath}. Set CLOUDFLARED_CONFIG or CLOUDFLARED_TUNNEL_TOKEN.`,
    );
  }

  const originalConfig = readFileSync(localConfigPath, "utf8");
  const rewrittenConfig = rewriteOriginServices(
    rewritePathEntries(originalConfig, binaryKind),
    originHost,
  );

  if (rewrittenConfig === originalConfig) {
    return {
      localPath: localConfigPath,
      commandPath:
        binaryKind === "windows"
          ? toWindowsPath(localConfigPath)
          : localConfigPath,
      cleanup: () => {},
    };
  }

  const tempConfigPath = buildTempConfigPath(localConfigPath);
  writeFileSync(tempConfigPath, rewrittenConfig);

  return {
    localPath: tempConfigPath,
    commandPath:
      binaryKind === "windows"
        ? toWindowsPath(tempConfigPath)
        : tempConfigPath,
    cleanup: () => {
      rmSync(tempConfigPath, { force: true });
    },
  };
}

const tunnelToken = process.env.CLOUDFLARED_TUNNEL_TOKEN?.trim();
const tunnelName =
  process.env.CLOUDFLARED_TUNNEL_NAME?.trim() || DEFAULT_CLOUDFLARED_TUNNEL_NAME;
const configPath =
  process.env.CLOUDFLARED_CONFIG?.trim() || resolveDefaultConfigPath();
const cloudflaredBinary = resolveCloudflaredBinary();
const originHost = resolveOriginHost(cloudflaredBinary.kind);

let tunnelCommand;
let preparedConfig: PreparedConfig | null = null;
if (tunnelToken) {
  tunnelCommand = [
    cloudflaredBinary.command,
    "tunnel",
    "run",
    "--token",
    tunnelToken,
  ];
} else {
  preparedConfig = prepareTunnelConfig(
    configPath,
    cloudflaredBinary.kind,
    originHost,
  );
  tunnelCommand = [
    cloudflaredBinary.command,
    "tunnel",
    "--config",
    preparedConfig.commandPath,
    "run",
    tunnelName,
  ];
}

log.step(
  tunnelToken
    ? "Starting Cloudflare tunnel with CLOUDFLARED_TUNNEL_TOKEN."
    : `Starting Cloudflare tunnel '${tunnelName}' via ${preparedConfig?.localPath || configPath}.`,
);
if (originHost) {
  log.info(`Routing local Cloudflare origin traffic to ${originHost}.`);
}
if (cloudflaredBinary.kind === "windows" && isWslEnvironment()) {
  log.info("Using cloudflared.exe from WSL.");
}

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
  preparedConfig?.cleanup();
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(0);
  });
}

const code = await tunnelProc.exited;
fail(`Cloudflare tunnel exited unexpectedly with code ${code}.`);
