import { fileURLToPath } from "node:url";
const tasks = {
  lint: [
    ["apps/backend", ["bun", "run", "lint"]],
    ["apps/web", ["bun", "run", "lint"]],
    ["apps/notifications", ["bun", "run", "lint"]],
    ["apps/mobile", ["bun", "run", "lint"]],
  ],
  typecheck: [
    ["apps/backend", ["bun", "run", "typecheck"]],
    ["apps/web", ["bun", "run", "typecheck"]],
    ["apps/notifications", ["bun", "run", "typecheck"]],
    ["apps/mobile", ["bun", "run", "typecheck"]],
  ],
} as const;

type Mode = keyof typeof tasks;

const mode = process.argv[2] as Mode | undefined;
const commands = mode ? tasks[mode] : undefined;

if (!commands) {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}

const children = commands.map(([cwd, cmd]) =>
  Bun.spawn({
    cmd: [process.execPath, ...cmd.slice(1)],
    cwd: fileURLToPath(new URL(`../${cwd}/`, import.meta.url)),
    stdout: "inherit",
    stderr: "inherit",
  }),
);

const results = await Promise.all(children.map((child) => child.exited));
process.exit(results.some((code) => code !== 0) ? 1 : 0);
