import "./prisma-engine";
import { PrismaClient, type Prisma } from "../generated/prisma";
import { errorLogDetails, redactPII } from "./log-sanitization";
import { createLogger } from "@workspace/logger";

const logger = createLogger("backend:prisma");
const isDevelopment = process.env.NODE_ENV === "development";
const prismaLogAllQueries = process.env.PRISMA_LOG_ALL_QUERIES === "true";
const prismaSlowQueryThresholdMs = Number.parseInt(
  process.env.PRISMA_SLOW_QUERY_THRESHOLD_MS ?? "150",
  10,
);

type PrismaQueryEvent = {
  query: string;
  duration: number;
};

type PrismaLogEvent = {
  message: string;
};

function normalizeQueryForLog(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

function shouldLogSlowQuery(duration: number): boolean {
  return Number.isFinite(prismaSlowQueryThresholdMs)
    ? duration >= prismaSlowQueryThresholdMs
    : false;
}

function isTransientConnectionReset(message: string): boolean {
  return /ConnectionReset|forcibly closed by the remote host/i.test(message);
}

const prismaLogLevels = [
  ...(isDevelopment
    ? ([{ emit: "event", level: "query" }] as const)
    : ([] as const)),
  { emit: "event", level: "error" },
  { emit: "event", level: "info" },
  { emit: "event", level: "warn" },
] satisfies Prisma.LogDefinition[];

type PrismaEventClient = PrismaClient & {
  $on(event: "query", callback: (event: PrismaQueryEvent) => void): void;
  $on(
    event: "error" | "warn" | "info",
    callback: (event: PrismaLogEvent) => void,
  ): void;
};

// Global Prisma client instance to prevent multiple connections
declare global {
  var __prisma: PrismaClient | undefined;
}

// Create a singleton Prisma client
export const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: prismaLogLevels,
  });

// Setup Prisma logging events
if (isDevelopment) {
  const prismaWithEvents = prisma as unknown as PrismaEventClient;
  prismaWithEvents.$on("query", (e) => {
    if (!prismaLogAllQueries && !shouldLogSlowQuery(e.duration)) {
      return;
    }

    const normalizedQuery = normalizeQueryForLog(e.query);

    if (prismaLogAllQueries) {
      logger.debug(`prisma:query ${normalizedQuery} [${e.duration}ms]`);
      return;
    }

    logger.warn(`prisma:slow-query ${normalizedQuery} [${e.duration}ms]`);
  });
  prismaWithEvents.$on("error", (e) => {
    if (isTransientConnectionReset(e.message)) {
      logger.warn(
        "Transient PostgreSQL connection reset detected; Prisma will reconnect automatically.",
      );
      return;
    }

    logger.error(redactPII(e.message));
  });
  prismaWithEvents.$on("warn", (e) => {
    logger.warn(redactPII(e.message));
  });
  prismaWithEvents.$on("info", (e) => {
    logger.info(redactPII(e.message));
  });
}

// In development, store the client globally to prevent hot reload issues
if (isDevelopment) {
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
    logger.error("Database connection failed", errorLogDetails(error));
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
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
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
      logger.error("Database query failed", errorLogDetails(error));
      return fallback || null;
    }
  },
};
