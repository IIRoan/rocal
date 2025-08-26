import { PrismaClient } from "../generated/prisma";
declare global {
    var __prisma: PrismaClient | undefined;
}
export declare const prisma: any;
export declare function checkDatabaseConnection(): Promise<boolean>;
export declare const db: any;
//# sourceMappingURL=prisma.d.ts.map