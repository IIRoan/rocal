/** Bundle the API for Vercel Bun Functions — workspace packages export raw `.ts`, so bundling avoids runtime ResolveMessage. */
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const backendRoot = import.meta.dir;
const outdir = join(backendRoot, "dist/vercel");
const prismaDir = join(backendRoot, "generated/prisma");

// Migrate only on Vercel production builds: Preview and local .env share the prod DB.
if (process.env.VERCEL_ENV === "production") {
  const migrate = await Bun.$`bun run db:deploy`.cwd(backendRoot);
  if (migrate.exitCode !== 0) {
    process.exit(migrate.exitCode ?? 1);
  }
}

const generate = await Bun.$`bun run db:generate`.cwd(backendRoot);
if (generate.exitCode !== 0) {
  process.exit(generate.exitCode ?? 1);
}

mkdirSync(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(backendRoot, "main.ts")],
  outdir,
  naming: "app.js",
  target: "bun",
  format: "esm",
  packages: "bundle",
  minify: {
    whitespace: true,
    syntax: true,
  },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

for (const name of [
  "libquery_engine-rhel-openssl-3.0.x.so.node",
  "libquery_engine-debian-openssl-3.0.x.so.node",
] as const) {
  const src = join(prismaDir, name);
  if (!(await Bun.file(src).exists())) {
    console.error(`Missing Prisma engine ${name} — check binaryTargets`);
    process.exit(1);
  }
  cpSync(src, join(outdir, name));
  console.log(`Copied ${name}`);
}

for (const output of result.outputs) {
  console.log(`Wrote ${output.path} (${output.kind})`);
}
