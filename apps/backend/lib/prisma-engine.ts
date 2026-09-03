/**
 * Pin Prisma's native query engine before PrismaClient loads.
 * Engines are copied next to the Bun bundle by `build-vercel.ts`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const RHEL = "libquery_engine-rhel-openssl-3.0.x.so.node";
const DEBIAN = "libquery_engine-debian-openssl-3.0.x.so.node";

function firstExisting(...candidates: string[]): string | undefined {
  return candidates.find((path) => existsSync(path));
}

if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  const dir = import.meta.dir;
  const preferRhel = Boolean(process.env.VERCEL);
  const resolved = preferRhel
    ? firstExisting(
        join(dir, RHEL),
        join(dir, "..", "..", "generated", "prisma", RHEL),
        join(dir, DEBIAN),
      )
    : firstExisting(
        join(dir, DEBIAN),
        join(dir, "..", "..", "generated", "prisma", DEBIAN),
        join(dir, RHEL),
      );

  if (resolved) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = resolved;
  }
}
