import { aot } from "elysia/plugin/aot/bun";

const backendRoot = import.meta.dir;
const entry = `${backendRoot}/index.ts`;

const aotResult = await Bun.build({
  entrypoints: [entry],
  outdir: `${backendRoot}/dist`,
  target: "bun",
  minify: {
    whitespace: true,
    syntax: true,
  },
  plugins: [
    aot(entry, {
      target: "bun",
      production: true,
    }),
  ],
});

if (!aotResult.success) {
  for (const log of aotResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

const compileResult = await Bun.build({
  entrypoints: [`${backendRoot}/dist/index.js`],
  compile: {
    target: "bun-linux-x64",
    outfile: `${backendRoot}/server`,
  },
});

if (!compileResult.success) {
  for (const log of compileResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

process.exit(0);
