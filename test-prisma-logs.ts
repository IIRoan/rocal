import { prisma } from "./apps/backend/lib/prisma.ts";

async function test() {
  await prisma.$queryRaw`SELECT 1`;
  console.log("Query finished");
}

test().catch(console.error);
