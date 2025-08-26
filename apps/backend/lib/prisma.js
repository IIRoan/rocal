import { PrismaClient } from "../generated/prisma";
// Create a singleton Prisma client
export const prisma = globalThis.__prisma ||
    new PrismaClient({
        log: process.env.NODE_ENV === "development"
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
export async function checkDatabaseConnection() {
    try {
        await prisma.$queryRaw `SELECT 1`;
        return true;
    }
    catch (error) {
        console.error("Database connection failed:", error);
        return false;
    }
}
// Database utilities
export const db = {
    ...prisma,
    // Health check
    async isHealthy() {
        return checkDatabaseConnection();
    },
    // Transaction wrapper
    async transaction(fn) {
        return prisma.$transaction(fn);
    },
    // Safe query wrapper with error handling
    async safeQuery(queryFn, fallback) {
        try {
            return await queryFn();
        }
        catch (error) {
            console.error("Database query failed:", error);
            return fallback || null;
        }
    },
};
