/** Pin Prisma's native query engine before PrismaClient loads; avoids `import.meta` so Jest (CJS) can parse this module. */
import { existsSync } from "node:fs";
import { join } from "node:path";

const RHEL = "libquery_engine-rhel-openssl-3.0.x.so.node";
const DEBIAN = "libquery_engine-debian-openssl-3.0.x.so.node";

function firstExisting(...candidates: string[]): string | undefined {
  return candidates.find((path) => existsSync(path));
}

/** Vercel ships engines beside the Bun bundle under `dist/vercel/`; local/Railway/Jest use Prisma's default discovery. */
if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY && process.env.VERCEL) {
  const cwd = process.cwd();
  const roots = [
    cwd,
    join(cwd, "dist/vercel"),
    join(cwd, "apps/backend/dist/vercel"),
  ];
  const resolved = firstExisting(
    ...roots.map((root) => join(root, RHEL)),
    ...roots.map((root) => join(root, DEBIAN)),
  );

  if (resolved) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = resolved;
  }
}
