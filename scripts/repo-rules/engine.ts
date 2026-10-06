import ts from "typescript";

export interface Finding {
  line: number;
  message: string;
}

export interface Comment {
  text: string;
  line: number;
  endLine: number;
  block: boolean;
}

export interface FileContext {
  path: string;
  text: string;
  ast: () => ts.SourceFile;
  comments: () => Comment[];
  lineOf: (pos: number) => number;
}

export interface Rule {
  id: string;
  summary: string;
  files: (file: string) => boolean;
  check: (file: FileContext) => Finding[];
  examples: { path: string; bad: string[]; good: string[] };
}

const ALLOW_MARKER = /repo-rules-allow ([a-z0-9-]+(?:, ?[a-z0-9-]+)*): \S/;

const IGNORED_PATH =
  /(^|\/)(node_modules|generated|__tests__|__mocks__|\.next|\.expo|\.turbo|dist|build|coverage|output)\/|\.d\.ts$|\.(test|spec|e2e)\.[cm]?[jt]sx?$|_test\.go$/;

const TOOLING_PATH = /(^|\/)scripts\//;

/** Matches non-test source files under any of the prefixes with one of the extensions. */
export function sourceUnder(prefixes: string[], extensions = /\.tsx?$/) {
  return (file: string) =>
    prefixes.some((prefix) => file.startsWith(prefix)) && extensions.test(file) && !IGNORED_PATH.test(file);
}

/** Shipped app source only: excludes per-app dev/release tooling under scripts/. */
export function appSourceUnder(prefixes: string[], extensions = /\.tsx?$/) {
  const inScope = sourceUnder(prefixes, extensions);
  return (file: string) => inScope(file) && !TOOLING_PATH.test(file);
}

export const CLIENT_SOURCE = [
  "apps/web/",
  "apps/native-calendar/",
  "apps/native-mail/",
  "packages/native-core/src/",
  "packages/ui/src/",
];

export function createContext(file: string, text: string): FileContext {
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (pos: number) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= pos) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
  let sourceFile: ts.SourceFile | undefined;
  let comments: Comment[] | undefined;
  const ast = () => {
    sourceFile ??= ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    return sourceFile;
  };
  const collect = () => {
    if (comments) return comments;
    const ranges = file.endsWith(".go") || !/\.[cm]?[jt]sx?$/.test(file) ? scanCStyleComments(text) : astComments(ast());
    comments = ranges.map(({ pos, end, block }) => ({
      text: text.slice(pos, end),
      line: lineOf(pos),
      endLine: lineOf(end - 1),
      block,
    }));
    return comments;
  };
  return { path: file, text, ast, comments: collect, lineOf };
}

function astComments(sourceFile: ts.SourceFile) {
  const seen = new Map<number, { pos: number; end: number; block: boolean }>();
  const text = sourceFile.text;
  const add = (ranges: ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      seen.set(range.pos, {
        pos: range.pos,
        end: range.end,
        block: range.kind === ts.SyntaxKind.MultiLineCommentTrivia,
      });
    }
  };
  const visit = (node: ts.Node) => {
    add(ts.getLeadingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.end));
    if (node.kind === ts.SyntaxKind.JsxText) return;
    for (const child of node.getChildren(sourceFile)) visit(child);
  };
  visit(sourceFile);
  return [...seen.values()].sort((a, b) => a.pos - b.pos);
}

/** Comment scanner for Go and CSS that skips quoted and backtick strings. */
function scanCStyleComments(text: string) {
  const ranges: Array<{ pos: number; end: number; block: boolean }> = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '"' || char === "'" || char === "`") {
      const close = char;
      i++;
      while (i < text.length && text[i] !== close && (close === "`" || text[i] !== "\n")) {
        if (text[i] === "\\" && close !== "`") i++;
        i++;
      }
      i++;
    } else if (char === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      ranges.push({ pos: i, end: end === -1 ? text.length : end, block: false });
      i = end === -1 ? text.length : end;
    } else if (char === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      ranges.push({ pos: i, end: stop, block: true });
      i = stop;
    } else i++;
  }
  return ranges;
}

/** True when a `repo-rules-allow <id>: <reason>` comment sits on the finding's line or the line above. */
function isAllowed(file: FileContext, ruleId: string, line: number) {
  const lines = file.text.split("\n");
  return [line - 1, line - 2].some((index) => {
    const match = ALLOW_MARKER.exec(lines[index] ?? "");
    return match?.[1]?.split(/, ?/).includes(ruleId) ?? false;
  });
}

export function runRule(rule: Rule, file: FileContext): Finding[] {
  return rule.check(file).filter((finding) => !isAllowed(file, rule.id, finding.line));
}

export function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

export function find(file: FileContext, predicate: (node: ts.Node) => string | null): Finding[] {
  const findings: Finding[] = [];
  const sourceFile = file.ast();
  walk(sourceFile, (node) => {
    const message = predicate(node);
    if (message) findings.push({ line: file.lineOf(node.getStart(sourceFile)), message });
  });
  return findings;
}

export function matchLines(file: FileContext, pattern: RegExp, message: (match: RegExpExecArray) => string) {
  const findings: Finding[] = [];
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (let match = global.exec(file.text); match; match = global.exec(file.text)) {
    findings.push({ line: file.lineOf(match.index), message: message(match) });
    if (match[0].length === 0) global.lastIndex++;
  }
  return findings;
}

export function calleeName(node: ts.CallExpression | ts.NewExpression) {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

export function jsxTagName(node: ts.JsxOpeningLikeElement) {
  return node.tagName.getText();
}

export function jsxAttribute(node: ts.JsxOpeningLikeElement, name: string) {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

export function hasSpreadAttributes(node: ts.JsxOpeningLikeElement) {
  return node.attributes.properties.some(ts.isJsxSpreadAttribute);
}

/** Name of the nearest named function, method, or variable-bound function containing the node. */
export function enclosingFunctionName(node: ts.Node): string | null {
  for (let current = node.parent; current; current = current.parent) {
    if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name) {
      return current.name.getText();
    }
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isVariableDeclaration(current.parent)) {
      return current.parent.name.getText();
    }
  }
  return null;
}

export const isComponentName = (name: string | null) => name !== null && /^[A-Z]/.test(name);

export function selfTest(rules: Rule[]): string[] {
  const failures: string[] = [];
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) failures.push(`${rule.id}: duplicate rule id`);
    ids.add(rule.id);
    if (!rule.files(rule.examples.path)) failures.push(`${rule.id}: example path ${rule.examples.path} is out of scope`);
    if (rule.examples.bad.length === 0) failures.push(`${rule.id}: needs at least one bad example`);
    for (const [index, source] of rule.examples.bad.entries()) {
      if (runRule(rule, createContext(rule.examples.path, source)).length === 0) {
        failures.push(`${rule.id}: bad example ${index + 1} was not reported`);
      }
    }
    for (const [index, source] of rule.examples.good.entries()) {
      const findings = runRule(rule, createContext(rule.examples.path, source));
      if (findings.length > 0) {
        failures.push(`${rule.id}: good example ${index + 1} was reported (${findings[0]?.message})`);
      }
    }
  }
  return failures;
}
