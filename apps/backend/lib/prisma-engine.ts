/**
 * Pin Prisma's native query engine before PrismaClient loads.
 * Engines are copied next to the Bun bundle by `build-vercel.ts`.
 *
 * Avoids `import.meta` so Jest (CJS) can parse this module.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const RHEL = "libquery_engine-rhel-openssl-3.0.x.so.node";
const DEBIAN = "libquery_engine-debian-openssl-3.0.x.so.node";

function firstExisting(...candidates: string[]): string | undefined {
  return candidates.find((path) => existsSync(path));
}

/**
 * On Vercel, engines ship beside the Bun bundle under `dist/vercel/`.
 * Local/Railway/Jest use Prisma's default engine discovery.
 */
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
