import { PrismaClient } from "../generated/prisma";
import { createLogger } from "@workspace/logger";

const logger = createLogger("backend:prisma");

// Global Prisma client instance to prevent multiple connections
declare global {
  var __prisma: PrismaClient | undefined;
}

// Create a singleton Prisma client
export const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// In development, store the client globally to prevent hot reload issues
if (process.env.NODE_ENV === "development") {
  globalThis.__prisma = prisma;
}

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error("Database connection failed:", error);
    return false;
  }
}

// Database utilities
export const db = {
  ...prisma,
  // Health check
  async isHealthy(): Promise<boolean> {
    return checkDatabaseConnection();
  },

  // Transaction wrapper
  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  },

  // Safe query wrapper with error handling
  async safeQuery<T>(
    queryFn: () => Promise<T>,
    fallback?: T,
  ): Promise<T | null> {
    try {
      return await queryFn();
    } catch (error) {
      logger.error("Database query failed:", error);
      return fallback || null;
    }
  },
};
