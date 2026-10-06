import { type Rule, matchLines, sourceUnder } from "./engine";

const COMMENTED_SOURCE = sourceUnder(["apps/", "packages/", "scripts/"], /\.(tsx?|go)$/);

const CODE_LINE =
  /^(import\s.+\sfrom\s|export\s+(const|function|default|class|type|interface)\s|(const|let|var)\s+[\w{[]+.*=|return\b.*;$|await\s+[\w.]+\(|if\s*\(.*\)\s*\{|\}\s*else\b|for\s*\(.*\)\s*\{|[\w$.]+\(.*\);$|<\/?[A-Z]\w*[\s/>]|\w+\s*:=\s*)/;

const TOOLING_COMMENT = /^(eslint-|@ts-|prettier-|istanbul |c8 |go:|nolint|#region|#endregion|repo-rules-allow )/;

const commentLines = (text: string) =>
  text
    .replace(/^\/\*+|\*+\/$/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*(\/\/+|\*)?\s?/, "").trim())
    .filter(Boolean);

export const commentRules: Rule[] = [
  {
    id: "comments-one-line",
    summary: "Every comment, including JSDoc, is a single line: no multi-line blocks and no // pair wrapping one sentence.",
    files: COMMENTED_SOURCE,
    check: (file) => [
      ...file
        .comments()
        .filter((comment) => comment.block && comment.endLine > comment.line)
        .map((comment) => ({ line: comment.line, message: "multi-line comment; keep it to one line (`/** Why. */`)" })),
      ...matchLines(
        file,
        /^[ \t]*\/\/[^\n]*[^.!?:;\s][ \t]*\n[ \t]*\/\/[ \t]*(?!(?:eslint-|@ts-|prettier-|istanbul |c8 |go:|nolint|#region|#endregion|repo-rules-allow ))[a-z]/gm,
        () => "comment wrapped onto the next line; make it one line or two standalone comments",
      ),
    ],
    examples: {
      path: "apps/backend/lib/example.ts",
      bad: ["/**\n * Loads a user.\n */\nexport function load() {}", "/* first\n   second */\nconst a = 1;", "// Loads the vault from\n// the offline store.\nexport {};"],
      good: ["/** Loads a user. */\nexport function load() {}", "// First standalone note.\n// Second standalone note.\nconst a = 1;", "// Keep the memo\n// eslint-disable-next-line no-console\nexport {};"],
    },
  },
  {
    id: "no-commented-out-code",
    summary: "Delete dead code instead of commenting it out.",
    files: COMMENTED_SOURCE,
    check: (file) =>
      file.comments().flatMap((comment) => {
        const lines = commentLines(comment.text);
        const code = lines.find((line) => !TOOLING_COMMENT.test(line) && CODE_LINE.test(line));
        return code ? [{ line: comment.line, message: `commented-out code "${code.slice(0, 60)}"; delete it` }] : [];
      }),
    examples: {
      path: "apps/web/components/example.tsx",
      bad: ["// const legacy = loadLegacy();\nexport {};", "// await refreshInbox();\nexport {};", "// <OldBanner />\nexport {};"],
      good: ["// Stalwart rejects empty filters, so send none.\nexport {};", "// eslint-disable-next-line no-console\nexport {};"],
    },
  },
  {
    id: "todos-need-owner",
    summary: "TODO, FIXME, HACK, and XXX comments name an owner `TODO(name)` or reference an issue.",
    files: COMMENTED_SOURCE,
    check: (file) =>
      file.comments().flatMap((comment) => {
        const marker = /\b(TODO|FIXME|HACK|XXX)\b(?!\s*\([^)\s]+\))/.exec(comment.text);
        if (!marker || /#\d+|\b[A-Z][A-Z0-9]+-\d+\b|https?:\/\//.test(comment.text)) return [];
        return [{ line: comment.line, message: `${marker[1]} without an owner or issue; write ${marker[1]}(owner) or link the issue` }];
      }),
    examples: {
      path: "apps/notifications/internal/push/push.go",
      bad: ["package push\n// TODO handle retries\n", "package push\n/* FIXME: flaky */\n"],
      good: ["package push\n// TODO(roan): handle retries\n", "package push\n// FIXME see #412\n", 'package push\nvar s = "// TODO in a string"\n'],
    },
  },
];
