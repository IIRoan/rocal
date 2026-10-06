import ts from "typescript";

import { type Rule, find, sourceUnder } from "./engine";

const PRISMA_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
  "count",
]);

const OWNER_KEYS = /^(userId|ownerId|user|owner|AND|OR|userId_\w+|\w+_userId\w*)$/;

/** Backend files that fetch fixed, trusted endpoints (Stalwart, APNs, auth providers), never a user-supplied URL. */
const TRUSTED_FETCH_FILES = new Set(["apps/backend/lib/safe-fetch.ts"]);

/** A function that receives a trusted owner id or runs an authorization helper has ownership context for its by-id follow-up writes. */
const OWNER_CONTEXT = /\b(userId|ownerId|viewerId|session|user\.id|assert\w*(Own|Access)\w*|ensure\w*Access\w*|canAccess\w*|authorize\w*)\b/;

function outermostFunction(node: ts.Node) {
  let outer: ts.Node | undefined;
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current) && !ts.isArrowFunction(current) && !ts.isFunctionExpression(current)) return current;
    if (ts.isFunctionLike(current)) outer = current;
  }
  return outer;
}

const isPrismaClient = (node: ts.Expression) => /(^|\.)(prisma|tx|db)$/.test(node.getText());

export const backendRules: Rule[] = [
  {
    id: "thin-routes",
    summary: "Backend routes are adapters: they may hand the Prisma client to a service constructor but never query it, and schemas come from contracts/.",
    files: sourceUnder(["apps/backend/routes/"]),
    check: (file) =>
      find(file, (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "zod") {
          return "route imports zod; put the schema in contracts/ and use RouteModel";
        }
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "prisma") {
          return "route queries Prisma directly; call a service";
        }
        return null;
      }),
    examples: {
      path: "apps/backend/routes/events.ts",
      bad: ['import { z } from "zod";', "const rows = await prisma.event.findMany();"],
      good: ['import { prisma } from "../lib/prisma";\nconst service = new EventService(prisma);\nconst rows = await service.list(session.user.id);'],
    },
  },
  {
    id: "owner-scoped-data",
    summary: "Service Prisma reads and writes filter by a trusted owner (userId/ownerId/user) or carry a reviewed allow comment naming the prior check.",
    files: sourceUnder(["apps/backend/services/"]),
    check: (file) =>
      find(file, (node) => {
        if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
        const operation = node.expression.name.text;
        const model = node.expression.expression;
        if (!PRISMA_OPERATIONS.has(operation) || !ts.isPropertyAccessExpression(model) || !isPrismaClient(model.expression)) return null;
        const [args] = node.arguments;
        if (!args || !ts.isObjectLiteralExpression(args)) return null;
        const where = args.properties.find((property) => property.name?.getText() === "where");
        if (!where || !ts.isPropertyAssignment(where) || !ts.isObjectLiteralExpression(where.initializer)) return null;
        const keys = where.initializer.properties.map((property) => property.name?.getText() ?? "...");
        if (keys.some((key) => key === "..." || OWNER_KEYS.test(key))) return null;
        if (OWNER_CONTEXT.test(outermostFunction(node)?.getText() ?? "")) return null;
        return `prisma.${model.name.text}.${operation} filters by {${keys.join(", ")}} in a function with no owner/session context; scope by userId or allow-comment why the record is not user-owned`;
      }),
    examples: {
      path: "apps/backend/services/event.service.ts",
      bad: [
        "async function remove(id: string) { await prisma.event.delete({ where: { id } }); }",
        "class S { async get(input: { id: string }) { return this.prisma.calendar.findFirst({ where: { id: input.id } }); } }",
      ],
      good: [
        "await prisma.event.deleteMany({ where: { id, userId } });",
        "async function remove(userId: string, id: string) { await assertOwner(userId, id); await prisma.event.delete({ where: { id } }); }",
        "await tx.calendar.findFirst({ where: { OR: [{ userId }, { shares: { some: { userId } } }] } });",
        "// repo-rules-allow owner-scoped-data: ownership checked by assertOwner above\nawait prisma.event.delete({ where: { id } });",
      ],
    },
  },
  {
    id: "safe-user-url-fetch",
    summary: "Backend outbound requests go through safeFetch; raw fetch is only for fixed trusted endpoints with an allow comment.",
    files: sourceUnder(["apps/backend/"]),
    check: (file) =>
      TRUSTED_FETCH_FILES.has(file.path)
        ? []
        : find(file, (node) => {
            if (!ts.isCallExpression(node)) return null;
            const callee = node.expression.getText();
            return callee === "fetch" || callee === "globalThis.fetch"
              ? "raw fetch in the backend; use safeFetch for user URLs or allow-comment the fixed trusted endpoint"
              : null;
          }),
    examples: {
      path: "apps/backend/services/subscription.service.ts",
      bad: ["const response = await fetch(subscription.url);"],
      good: [
        "const response = await safeFetch(subscription.url, { timeoutMs: 10_000 });",
        "// repo-rules-allow safe-user-url-fetch: fixed Stalwart admin endpoint\nconst response = await fetch(`${STALWART_URL}/api`);",
      ],
    },
  },
];
