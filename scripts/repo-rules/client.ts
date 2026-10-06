import ts from "typescript";

import { type Rule, CLIENT_SOURCE, appSourceUnder, calleeName, enclosingFunctionName, find, sourceUnder } from "./engine";

const QUERY_PRIMITIVES = new Set(["useQuery", "useQueries", "useInfiniteQuery", "useSuspenseQuery", "useSuspenseInfiniteQuery", "useMutation"]);

const QUERY_KEY_METHODS = new Set([
  "invalidateQueries",
  "refetchQueries",
  "removeQueries",
  "resetQueries",
  "cancelQueries",
  "setQueryData",
  "getQueryData",
  "setQueriesData",
  "getQueriesData",
  "ensureQueryData",
  "fetchQuery",
  "prefetchQuery",
]);

const isQueryKeyFactory = (file: string) => /query-keys\.ts$/.test(file);

const isStaticString = (node: ts.Node) => ts.isStringLiteralLike(node);

const PLAINTEXT_CONTENT_KEYS = new Set(["title", "description", "location", "name"]);

const LOCAL_TIME_IMPORTS = new Set(["startOfDay", "endOfDay", "isToday", "isTomorrow", "isYesterday", "isSameDay", "format"]);

export const clientRules: Rule[] = [
  {
    id: "client-api-boundary",
    summary: "App code reaches Solace APIs through @workspace/calendar-client; raw fetch/XMLHttpRequest needs an allow comment naming the protocol.",
    files: appSourceUnder(CLIENT_SOURCE),
    check: (file) =>
      find(file, (node) => {
        if (ts.isCallExpression(node) && ["fetch", "globalThis.fetch", "window.fetch"].includes(node.expression.getText())) {
          return "raw fetch in app code; use @workspace/calendar-client (or allow-comment a separate protocol such as JMAP)";
        }
        if (ts.isNewExpression(node) && node.expression.getText() === "XMLHttpRequest") return "XMLHttpRequest in app code; use @workspace/calendar-client";
        return null;
      }),
    examples: {
      path: "apps/web/hooks/use-events.ts",
      bad: ['const res = await fetch("/api/events");', "const xhr = new XMLHttpRequest();"],
      good: ["const events = await calendarApi.listEvents(range);"],
    },
  },
  {
    id: "e2ee-client-content",
    summary: "Payloads never carry plaintext title/description/location/name next to ciphertext; build them with the shared E2EE request builders.",
    files: sourceUnder(["packages/calendar-client/src/", "apps/web/lib/", "packages/native-core/src/lib/", "packages/e2ee/src/"]),
    check: (file) =>
      find(file, (node) => {
        if (!ts.isObjectLiteralExpression(node)) return null;
        const keys = node.properties.map((property) => property.name?.getText() ?? "");
        const plaintext = keys.filter((key) => PLAINTEXT_CONTENT_KEYS.has(key));
        const encrypted = keys.some((key) => /^(encrypted|ciphertext)/i.test(key));
        return plaintext.length > 0 && encrypted
          ? `payload mixes plaintext ${plaintext.join("/")} with ciphertext; send ciphertext only (encryptEventContentRequest/encryptNameRequest)`
          : null;
      }),
    examples: {
      path: "packages/calendar-client/src/events.ts",
      bad: ["const body = { encryptedContent, title: input.title };"],
      good: ["const body = { encryptedContent, startTime };", "const view = { title: decrypted.title, color };"],
    },
  },
  {
    id: "client-safe-logging",
    summary: "Web and native code log only static strings to the console; user data never reaches console output.",
    files: appSourceUnder(CLIENT_SOURCE),
    check: (file) =>
      find(file, (node) => {
        if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
        if (node.expression.expression.getText() !== "console") return null;
        return node.arguments.every(isStaticString)
          ? null
          : `console.${node.expression.name.text} with dynamic arguments; log a static message or report through the scrubbed error reporter`;
      }),
    examples: {
      path: "apps/native-mail/src/lib/mail/sync.ts",
      bad: ["console.error(error);", "console.log(`subject ${message.subject}`);"],
      good: ['console.warn("Mail sync paused");'],
    },
  },
  {
    id: "secure-email-html",
    summary: "Raw HTML is only inserted by the reviewed sanitizing renderers, and frames never allow scripts.",
    files: appSourceUnder(CLIENT_SOURCE),
    check: (file) =>
      find(file, (node) => {
        if (ts.isJsxAttribute(node) && node.name.getText() === "dangerouslySetInnerHTML") {
          return "dangerouslySetInnerHTML outside a reviewed sanitizing renderer; sanitize via processEmailHtml/buildEmailHtmlDocument and allow-comment the boundary";
        }
        if (ts.isStringLiteralLike(node) && /\ballow-scripts\b/.test(node.text)) return "sandbox allows scripts; email frames must not run scripts";
        return null;
      }),
    examples: {
      path: "apps/web/components/mail/message-body.tsx",
      bad: ["const a = <div dangerouslySetInnerHTML={{ __html: message.html }} />;", 'const b = <iframe sandbox="allow-scripts" />;'],
      good: [
        'const c = <iframe sandbox="allow-popups" srcDoc={buildEmailHtmlDocument(html)} />;',
        "{/* repo-rules-allow secure-email-html: input is sanitized by processEmailHtml */}\nconst d = <div dangerouslySetInnerHTML={{ __html: safe }} />;",
      ],
    },
  },
  {
    id: "query-key-factory",
    summary: "Query keys come from a key factory (`*query-keys.ts`), never inline arrays.",
    files: (file) => appSourceUnder(CLIENT_SOURCE)(file) && !isQueryKeyFactory(file),
    check: (file) =>
      find(file, (node) => {
        if (ts.isPropertyAssignment(node) && node.name.getText() === "queryKey" && ts.isArrayLiteralExpression(node.initializer)) {
          return "inline query key array; add it to the query-key factory";
        }
        if (ts.isCallExpression(node) && QUERY_KEY_METHODS.has(calleeName(node) ?? "") && node.arguments[0] && ts.isArrayLiteralExpression(node.arguments[0])) {
          return `inline query key passed to ${calleeName(node)}; use the query-key factory`;
        }
        return null;
      }),
    examples: {
      path: "apps/web/hooks/use-events.ts",
      bad: ['useQuery({ queryKey: ["events", range], queryFn });', 'queryClient.setQueryData(["events"], next);'],
      good: ["useQuery({ queryKey: calendarQueryKeys.events(range), queryFn });"],
    },
  },
  {
    id: "query-domain-hooks",
    summary: "useQuery/useMutation live in named `use*` domain hooks; components consume hooks.",
    files: appSourceUnder(CLIENT_SOURCE),
    check: (file) =>
      find(file, (node) => {
        if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || !QUERY_PRIMITIVES.has(node.expression.text)) return null;
        const owner = enclosingFunctionName(node);
        return owner && /^use[A-Z0-9]/.test(owner)
          ? null
          : `${node.expression.text} called in ${owner ?? "a non-hook scope"}; move it into a use* domain hook`;
      }),
    examples: {
      path: "apps/web/components/inbox.tsx",
      bad: ["export function Inbox() { const q = useQuery(options); return null; }"],
      good: ["export function useInbox() { return useQuery(options); }", "export const useSend = () => useMutation({ mutationFn });"],
    },
  },
  {
    id: "no-blanket-invalidate",
    summary: "Invalidate the precise key; never invalidate or refetch every query.",
    files: appSourceUnder(CLIENT_SOURCE),
    check: (file) =>
      find(file, (node) => {
        if (!ts.isCallExpression(node) || !["invalidateQueries", "refetchQueries", "resetQueries"].includes(calleeName(node) ?? "")) return null;
        const [filters] = node.arguments;
        const blanket = !filters || (ts.isObjectLiteralExpression(filters) && !filters.properties.some((p) => ["queryKey", "predicate"].includes(p.name?.getText() ?? "")));
        return blanket ? `${calleeName(node)} without a queryKey refetches everything; pass the precise key` : null;
      }),
    examples: {
      path: "apps/web/hooks/use-events.ts",
      bad: ["await queryClient.invalidateQueries();", "queryClient.refetchQueries({ type: 'active' });"],
      good: ["await queryClient.invalidateQueries({ queryKey: calendarQueryKeys.events(range) });"],
    },
  },
  {
    id: "timezone-safe-calendar-code",
    summary: "Event times use calendar-core zoned helpers, never local Date setters or date-fns local-day/format helpers.",
    files: sourceUnder([
      "apps/web/components/event-editor/",
      "apps/web/hooks/use-calendar-",
      "apps/native-calendar/src/components/event/",
      "apps/native-calendar/src/hooks/use-event-",
      "packages/calendar-core/src/",
      "packages/calendar-ics/src/",
    ]),
    check: (file) =>
      find(file, (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith("date-fns")) {
          const names = node.importClause?.namedBindings;
          const local = names && ts.isNamedImports(names) ? names.elements.map((e) => (e.propertyName ?? e.name).text).filter((n) => LOCAL_TIME_IMPORTS.has(n)) : [];
          return local.length > 0 ? `date-fns ${local.join(", ")} use the machine timezone; use calendar-core zoned helpers` : null;
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^set(Hours|Minutes|Seconds|Milliseconds|Date|Month|FullYear)$/.test(node.expression.name.text)) {
          return `Date.${node.expression.name.text} uses the machine timezone; use wallClockToUtc/utcToPickerDate (allow-comment picker wall-clock carriers)`;
        }
        return null;
      }),
    examples: {
      path: "apps/web/components/event-editor/time-row.tsx",
      bad: ['import { startOfDay, format } from "date-fns";', "start.setHours(9, 0, 0, 0);"],
      good: ['import { addMinutes } from "date-fns";\nconst end = wallClockToUtc(day, "09:00", timezone);'],
    },
  },
];
