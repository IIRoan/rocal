#!/usr/bin/env bun

const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_API_URL = "http://localhost:3001";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;
const apiUrl = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;

const appUrlObj = new URL(appUrl);
const apiUrlObj = new URL(apiUrl);

const liveReloadHost = appUrlObj.hostname || "localhost";
const liveReloadPort =
  appUrlObj.port || (appUrlObj.protocol === "https:" ? "443" : "80");
const apiPort = apiUrlObj.port || (apiUrlObj.protocol === "https:" ? "443" : "80");
const autoStartDevServer = process.env.MOBILE_DEV_AUTO_START !== "false";
const waitTimeoutMs = 90_000;
const pollIntervalMs = 1_000;

const rawArgs = Bun.argv.slice(2);

const adbConnectArg = rawArgs.find((arg) => arg.startsWith("--adb-connect="));
const adbConnectEndpoint =
  adbConnectArg?.slice("--adb-connect=".length) || process.env.MOBILE_ADB_CONNECT;
const passthroughArgs = rawArgs.filter(
  (arg) => !arg.startsWith("--adb-connect="),
);
const targetArg = passthroughArgs.find((arg) => arg.startsWith("--target="));
const targetFromArgs = targetArg?.slice("--target=".length) || "";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isHttpReachable = async (url: string) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.status < 500;
  } catch {
    return false;
  }
};

const waitForServer = async (url: string, timeoutMs: number) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isHttpReachable(url)) {
      return true;
    }
    await sleep(pollIntervalMs);
  }
  return false;
};

const runCommand = (cmd: string[]) => {
  const proc = Bun.spawnSync(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    code: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout).trim(),
    stderr: new TextDecoder().decode(proc.stderr).trim(),
  };
};

const getAdbDevices = () => {
  const startServer = runCommand(["adb", "start-server"]);
  if (startServer.code !== 0) {
    return {
      ok: false,
      error:
        startServer.stderr ||
        "Failed to start ADB server. Ensure Android platform tools are installed and in PATH.",
      devices: [] as string[],
      unauthorized: [] as string[],
    };
  }

  const result = runCommand(["adb", "devices"]);
  if (result.code !== 0) {
    return {
      ok: false,
      error:
        result.stderr ||
        "Failed to list ADB devices. Ensure Android platform tools are installed and in PATH.",
      devices: [] as string[],
      unauthorized: [] as string[],
    };
  }

  const devices: string[] = [];
  const unauthorized: string[] = [];

  const lines = result.stdout.split(/\r?\n/).slice(1);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [id, state] = trimmed.split(/\s+/);
    if (!id || !state) continue;
    if (state === "device") devices.push(id);
    if (state === "unauthorized") unauthorized.push(id);
  }

  return { ok: true, error: "", devices, unauthorized };
};

const reversePort = (deviceId: string, port: string) => {
  const result = runCommand([
    "adb",
    "-s",
    deviceId,
    "reverse",
    `tcp:${port}`,
    `tcp:${port}`,
  ]);

  if (result.code !== 0) {
    throw new Error(
      result.stderr || `Failed to adb reverse tcp:${port} for device ${deviceId}`,
    );
  }
};

const tryAdbConnect = (endpoint: string) => {
  console.log(`[mobile:dev:wifi] Attempting adb connect to ${endpoint}...`);
  const result = runCommand(["adb", "connect", endpoint]);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
};

let adbState = getAdbDevices();
if (!adbState.ok) {
  console.error(`[mobile:dev:wifi] ${adbState.error}`);
  process.exit(1);
}

if (adbConnectEndpoint && adbState.devices.length === 0) {
  tryAdbConnect(adbConnectEndpoint);
  adbState = getAdbDevices();
}

if (adbState.unauthorized.length > 0) {
  console.error(
    `[mobile:dev:wifi] Unauthorized Android device(s): ${adbState.unauthorized.join(", ")}.`,
  );
  console.error(
    "[mobile:dev:wifi] Accept the USB debugging prompt on the phone, then rerun.",
  );
  process.exit(1);
}

if (adbState.devices.length === 0) {
  console.error(
    "[mobile:dev:wifi] No Android device detected. Connect USB (with USB debugging), or pass --adb-connect=<phone-ip:port>.",
  );
  process.exit(1);
}

const localDevUrl = `http://127.0.0.1:${liveReloadPort}`;
const liveReloadUrl = `${appUrlObj.protocol}//${liveReloadHost}:${liveReloadPort}`;

let targetDeviceId = targetFromArgs;
if (!targetDeviceId && adbState.devices.length === 1) {
  targetDeviceId = adbState.devices[0];
}

if (!targetDeviceId && adbState.devices.length > 1) {
  console.error(
    `[mobile:dev:wifi] Multiple devices connected (${adbState.devices.join(", ")}). Pass --target=<device-id>.`,
  );
  process.exit(1);
}

if (targetDeviceId && !adbState.devices.includes(targetDeviceId)) {
  console.error(
    `[mobile:dev:wifi] Target device '${targetDeviceId}' not found in adb devices: ${adbState.devices.join(", ")}.`,
  );
  process.exit(1);
}

let devServerProc: Bun.Subprocess | null = null;
if (autoStartDevServer) {
  const alreadyRunning = await isHttpReachable(localDevUrl);
  if (!alreadyRunning) {
    console.log(
      `[mobile:dev:wifi] No local dev server detected on ${localDevUrl}. Starting Next.js dev server...`,
    );

    devServerProc = Bun.spawn(
      [
        "bun",
        "--bun",
        "next",
        "dev",
        "--webpack",
        "--hostname",
        "0.0.0.0",
        "--port",
        liveReloadPort,
      ],
      {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
      },
    );

    const ready = await waitForServer(localDevUrl, waitTimeoutMs);
    if (!ready) {
      console.error(
        `[mobile:dev:wifi] Dev server did not become reachable on ${localDevUrl} within ${waitTimeoutMs / 1000}s.`,
      );
      devServerProc.kill();
      process.exit(1);
    }
  }
}

const runArgs = [
  "cap",
  "run",
  "android",
  "-l",
  `--host=${liveReloadHost}`,
  `--port=${liveReloadPort}`,
  ...(targetDeviceId && !targetFromArgs ? [`--target=${targetDeviceId}`] : []),
  ...passthroughArgs,
];

const command = ["bunx", ...runArgs];

console.log(
  `[mobile:dev:wifi] Preparing adb reverse for device ${targetDeviceId} (app:${liveReloadPort}, api:${apiPort})`,
);

if (targetDeviceId) {
  const reversePorts = Array.from(new Set([liveReloadPort, apiPort]));
  try {
    for (const port of reversePorts) {
      reversePort(targetDeviceId, port);
    }
  } catch (error) {
    console.error(
      `[mobile:dev:wifi] ${(error as Error).message}. Check USB debugging authorization and rerun.`,
    );
    if (devServerProc) {
      devServerProc.kill();
    }
    process.exit(1);
  }
}

console.log(`[mobile:dev:wifi] Starting Android live reload on ${liveReloadUrl}`);
console.log(`[mobile:dev:wifi] Running: ${command.join(" ")}`);

const proc = Bun.spawn(command, {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const exitCode = await proc.exited;
if (devServerProc) {
  devServerProc.kill();
}
process.exit(exitCode);
