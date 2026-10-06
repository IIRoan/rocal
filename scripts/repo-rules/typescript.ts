import ts from "typescript";

import { type FileContext, type Rule, find, matchLines, sourceUnder, walk } from "./engine";

const TYPED_SOURCE = sourceUnder(["apps/", "packages/"]);

/** True when a comment ends on the node's line or the line above; AGENTS.md requires one for every escape hatch. */
function hasExplainingComment(file: FileContext, line: number) {
  return file.comments().some((comment) => comment.endLine === line || comment.endLine === line - 1);
}

const unwrap = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node) ? unwrap(node.expression) : node;

const isUntrustedSource = (node: ts.Expression) => {
  const inner = unwrap(node);
  if (!ts.isCallExpression(inner)) return null;
  const callee = inner.expression.getText();
  if (callee === "JSON.parse") return "JSON.parse";
  if (ts.isPropertyAccessExpression(inner.expression) && inner.expression.name.text === "json" && inner.arguments.length === 0) return ".json()";
  return null;
};

/** TanStack Query methods that resolve even when the underlying fetch fails. */
const NON_REJECTING_METHODS = new Set(["invalidateQueries", "prefetchQuery", "prefetchInfiniteQuery", "refetchQueries", "cancelQueries", "resetQueries"]);

/** True when the same-file declaration of `name` wraps its body in try/catch, so its promise does not reject. */
function catchesInternally(file: FileContext, name: string) {
  let handled = false;
  walk(file.ast(), (node) => {
    let body: ts.Node | undefined;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) body = node.body;
    if (ts.isVariableDeclaration(node) && node.name.getText() === name && node.initializer) {
      let init: ts.Expression = node.initializer;
      if (ts.isCallExpression(init) && /^use(Callback|EffectEvent)$/.test(init.expression.getText()) && init.arguments[0]) init = init.arguments[0];
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) body = init.body;
    }
    if (body && ts.isBlock(body) && body.statements.some((statement) => ts.isTryStatement(statement) && statement.catchClause)) handled = true;
  });
  return handled;
}

export const typescriptRules: Rule[] = [
  {
    id: "type-escape-hatches",
    summary: "any, `as unknown as`, @ts-ignore/@ts-nocheck, and non-null `!` each need a comment on the same or previous line explaining the guarantee.",
    files: TYPED_SOURCE,
    check(file) {
      const findings = find(file, (node) => {
        if (node.kind === ts.SyntaxKind.AnyKeyword) return "explicit any";
        if (ts.isNonNullExpression(node)) return "non-null assertion";
        if (ts.isAsExpression(node) && ts.isAsExpression(node.expression) && node.expression.type.kind === ts.SyntaxKind.UnknownKeyword) {
          return "`as unknown as` double cast";
        }
        return null;
      });
      findings.push(...matchLines(file, /@ts-(ignore|nocheck)\b/, (match) => `${match[0]}; use @ts-expect-error with a reason or fix the type`));
      return findings
        .filter((finding) => finding.message.startsWith("@ts") || !hasExplainingComment(file, finding.line))
        .map((finding) => ({ ...finding, message: finding.message.startsWith("@ts") ? finding.message : `${finding.message} without a comment explaining why it is safe` }));
    },
    examples: {
      path: "packages/calendar-core/src/example.ts",
      bad: ["export const a = (value: any) => value;", "export const b = items[0]!.id;", "export const c = raw as unknown as Event;", "// @ts-ignore\nexport const d = 1;"],
      good: ["export const a = (value: unknown) => value;", "// Bounded by the length check above.\nexport const b = items[0]!.id;", "export const e = raw as unknown;"],
    },
  },
  {
    id: "typescript-untrusted-input",
    summary: "JSON.parse and response.json() results are validated (Zod or a type guard), not cast to a domain type.",
    files: TYPED_SOURCE,
    check: (file) =>
      find(file, (node) => {
        if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) return null;
        if (node.type.kind === ts.SyntaxKind.UnknownKeyword) return null;
        if (ts.isTypeReferenceNode(node.type) && node.type.typeName.getText() === "Promise" && node.type.typeArguments?.[0]?.kind === ts.SyntaxKind.UnknownKeyword) return null;
        const source = isUntrustedSource(node.expression);
        return source ? `${source} result cast to ${node.type.getText()}; keep it unknown and parse with a Zod schema` : null;
      }),
    examples: {
      path: "apps/backend/lib/example.ts",
      bad: ["const a = JSON.parse(raw) as Settings;", "const b = (await response.json()) as Mailbox[];", "const c = response.json() as Promise<User>;"],
      good: ["const a = SettingsSchema.parse(JSON.parse(raw));", "const b: unknown = await response.json();", "const c = JSON.parse(raw) as unknown;"],
    },
  },
  {
    id: "typescript-null-safety",
    summary: "Array.find results are checked or optional-chained before they are dereferenced.",
    files: TYPED_SOURCE,
    check: (file) =>
      find(file, (node) => {
        if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return null;
        if (node.questionDotToken) return null;
        const target = node.expression;
        return ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression) && target.expression.name.text === "find"
          ? "dereferences an Array.find result that may be undefined; check it or use ?."
          : null;
      }),
    examples: {
      path: "apps/web/lib/example.ts",
      bad: ["const name = users.find((u) => u.id === id).name;"],
      good: ["const name = users.find((u) => u.id === id)?.name;"],
    },
  },
  {
    id: "async-promise-handling",
    summary: "`void promise` does not handle rejection; attach .catch (or await it) on every fire-and-forget call.",
    files: TYPED_SOURCE,
    check: (file) =>
      find(file, (node) => {
        if (!ts.isVoidExpression(node)) return null;
        const expression = unwrap(node.expression);
        if (!ts.isCallExpression(expression)) return null;
        const callee = expression.expression;
        if (ts.isIdentifier(callee) && catchesInternally(file, callee.text)) return null;
        if (ts.isPropertyAccessExpression(callee)) {
          const method = callee.name.text;
          if (method === "catch" || NON_REJECTING_METHODS.has(method) || (method === "then" && expression.arguments.length >= 2)) return null;
          if (method === "finally" && ts.isCallExpression(callee.expression) && /\.catch$/.test(callee.expression.expression.getText())) return null;
        }
        return "`void` discards the promise without handling rejection; add .catch(...) or await it";
      }),
    examples: {
      path: "apps/web/hooks/use-sync.ts",
      bad: ["void syncInbox();", "void SecureStore.deleteItemAsync(key);"],
      good: [
        "void syncInbox().catch(reportError);",
        "await syncInbox();",
        "void load().then(apply, reportError);",
        "void queryClient.invalidateQueries({ queryKey });",
        "const save = useCallback(async () => { try { await put(); } catch { toast.error('Failed'); } }, []);\nvoid save();",
      ],
    },
  },
];
