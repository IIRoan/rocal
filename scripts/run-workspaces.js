const { spawn } = require('node:child_process');
const path = require('node:path');

const tasks = {
  lint: [
    ['apps/backend', 'bun run lint'],
    ['apps/web', 'bun run lint'],
    ['apps/notifications', 'bun run lint'],
    ['apps/mobile', 'bun run lint'],
  ],
  typecheck: [
    ['apps/backend', 'bun run typecheck'],
    ['apps/web', 'bun run typecheck'],
    ['apps/notifications', 'bun run typecheck'],
    ['apps/mobile', 'bun run typecheck'],
  ],
};

const mode = process.argv[2];
const commands = tasks[mode];

if (!commands) {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}

const procs = commands.map(([cwd, command]) => {
  const child = spawn(command, {
    cwd: path.resolve(__dirname, '..', cwd),
    stdio: 'inherit',
    shell: true,
  });

  return child;
});

let failed = false;
let done = 0;

for (const child of procs) {
  child.on('exit', (code) => {
    done += 1;
    if (code !== 0) failed = true;
    if (done === procs.length) process.exit(failed ? 1 : 0);
  });
}
