#!/usr/bin/env bun

import { createInterface } from "node:readline/promises";

const APPS = {
  calendar: "apps/native-calendar",
  mail: "apps/native-mail",
} as const;
type AppName = keyof typeof APPS;

const isAppName = (value: string | undefined): value is AppName =>
  value === "calendar" || value === "mail";

async function promptApp(): Promise<AppName> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (
        await rl.question("Start which app? [1] calendar  [2] mail: ")
      )
        .trim()
        .toLowerCase();
      if (answer === "1" || answer === "calendar") return "calendar";
      if (answer === "2" || answer === "mail") return "mail";
    }
  } finally {
    rl.close();
  }
}

const [first, ...rest] = process.argv.slice(2);
const app = isAppName(first) ? first : await promptApp();
const extraArgs = isAppName(first) ? rest : process.argv.slice(2);

const proc = Bun.spawn([process.execPath, "run", "dev", ...extraArgs], {
  cwd: APPS[app],
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    proc.kill();
    process.exit(0);
  });
}

process.exit(await proc.exited);
