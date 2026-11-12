/** Writes the third-party notices both apps show and fails on a dependency whose license AGPL-3.0 cannot carry; `--check` only compares. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OUTPUT = join(ROOT, "packages/calendar-core/src/third-party-notices.json");
/** Web imports packages/ui through a path alias, so no package.json leads to it and it is a root of its own. */
const SHIPPED_WORKSPACES = ["apps/web", "apps/native-calendar", "apps/native-mail", "packages/ui"];

/** Licenses that may be combined into an AGPL-3.0 work; anything else needs a human decision. */
const AGPL_COMPATIBLE = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "LGPL-3.0+",
  "LGPL-3.0-or-later",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
]);

/** Assets outside node_modules that ship in an app. */
const EXTRA_PACKAGES = [
  { name: "WHATWG HTML named character references", version: "Living Standard", license: "BSD-3-Clause", file: "packages/calendar-core/src/vendor/WHATWG-LICENSE.txt" },
  { name: "postal-mime (HTML entity data)", version: "2.7.4", license: "MIT-0", file: "packages/calendar-core/src/vendor/postal-mime-LICENSE.txt" },
  { name: "Inter", version: "4.1", license: "OFL-1.1", file: "packages/ui/src/font/inter-font/LICENSE.txt" },
];

interface PackageJson {
  name: string;
  version: string;
  license?: string | { type?: string };
  licenses?: Array<{ type?: string }>;
}

interface LockMeta {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalPeers?: string[];
  os?: unknown;
  cpu?: unknown;
}

interface Lockfile {
  workspaces: Record<string, LockMeta & { name: string }>;
  packages: Record<string, [id: string, registry?: string, meta?: LockMeta, integrity?: string]>;
}

interface Notice {
  name: string;
  version: string;
  license: string;
  copyright: string[];
  notice?: string;
  body: string | null;
}

function declaredLicense(pkg: PackageJson): string {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  return pkg.licenses?.map((entry) => entry.type).filter(Boolean).join(" OR ") ?? "UNKNOWN";
}

/** True when some OR-alternative uses only compatible licenses; other shapes need every id compatible. */
function isAgplCompatible(expression: string): boolean {
  const flat = expression.trim().replace(/^\((.*)\)$/, "$1");
  if (!/[()]/.test(flat) && /\sOR\s/.test(flat)) {
    return flat.split(/\s+OR\s+/).some((alternative) => alternative.split(/\s+AND\s+/).every((id) => AGPL_COMPATIBLE.has(id)));
  }
  const ids = (flat.match(/[\w.+-]+/g) ?? []).filter((token) => !["AND", "OR", "WITH"].includes(token));
  return ids.length > 0 && ids.every((id) => AGPL_COMPATIBLE.has(id));
}

function findFile(dir: string, pattern: RegExp): string | null {
  const file = readdirSync(dir).sort().find((name) => pattern.test(name));
  return file ? readFileSync(join(dir, file), "utf8") : null;
}

const COPYRIGHT_LINE = /^\s*(copyright\b|\(c\)|©)/i;
const LICENSE_TITLE = /^\s*(the )?(mit|isc) licen[cs]e( \(mit\))?\s*$/i;

/** Splits a license file into its copyright lines and a whitespace-normalized body that many packages share. */
function splitLicense(text: string): { copyright: string[]; body: string } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const isCopyright = (line: string) => COPYRIGHT_LINE.test(line) && !/[[{]yyyy[\]}]/i.test(line);
  const copyright = [...new Set(lines.filter(isCopyright).map((line) => line.trim()))];
  const body = lines
    .filter((line) => !isCopyright(line) && !LICENSE_TITLE.test(line))
    .join("\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  return { copyright, body };
}

/** Lock keys nest package names by path, like node_modules: `a/@scope/b` is a's copy of @scope/b. */
function keySegments(key: string): string[] {
  return key.match(/@[^/]+\/[^/]+|[^/]+/g) ?? [];
}

/** Every installed package by name@version, because Bun versions place the same lockfile entry at different paths. */
function indexInstalled(workspaceDirs: string[]): Map<string, string> {
  const installed = new Map<string, string>();
  const scan = (modules: string) => {
    if (!existsSync(modules)) return;
    for (const entry of readdirSync(modules, { withFileTypes: true })) {
      // Workspace links are symlinks; each workspace's own node_modules is scanned as a root.
      if (entry.name.startsWith(".") || !entry.isDirectory()) continue;
      const names = entry.name.startsWith("@") ? readdirSync(join(modules, entry.name)).map((name) => join(entry.name, name)) : [entry.name];
      for (const name of names) {
        const dir = join(modules, name);
        const manifest = join(dir, "package.json");
        if (!existsSync(manifest)) continue;
        const pkg = JSON.parse(readFileSync(manifest, "utf8")) as PackageJson;
        installed.set(`${pkg.name}@${pkg.version}`, dir);
        scan(join(dir, "node_modules"));
      }
    }
  };
  for (const dir of workspaceDirs) scan(join(ROOT, dir, "node_modules"));
  return installed;
}

/** Takes the package set from bun.lock, not node_modules, because leftovers from older installs would change the result per machine. */
function collectNotices(): { notices: Notice[]; rejected: string[]; stale: string[] } {
  const lock = Bun.JSONC.parse(readFileSync(join(ROOT, "bun.lock"), "utf8")) as Lockfile;
  const installed = indexInstalled(Object.keys(lock.workspaces));
  const resolve = (name: string, from: string[]) => {
    for (let depth = from.length; depth >= 0; depth--) {
      const key = [...from.slice(0, depth), name].join("/");
      if (lock.packages[key]) return key;
    }
    return null;
  };
  // Optional peers stay out: a package that is really used is someone's dependency, and otherwise a dev tool could slip in.
  const edges = (meta: LockMeta, from: string[]) => [
    ...Object.keys({ ...meta.dependencies, ...meta.peerDependencies })
      .filter((name) => !meta.optionalPeers?.includes(name))
      .map((name) => ({ name, from, optional: false })),
    ...Object.keys(meta.optionalDependencies ?? {}).map((name) => ({ name, from, optional: true })),
  ];

  const byId = new Map<string, Notice>();
  const rejected: string[] = [];
  const stale: string[] = [];
  const visited = new Set<string>();
  for (const shipped of SHIPPED_WORKSPACES) {
    const workspace = lock.workspaces[shipped];
    if (!workspace) throw new Error(`${shipped} is not a workspace in bun.lock`);
    const stack = edges(workspace, [workspace.name]);
    while (stack.length > 0) {
      const next = stack.pop();
      if (!next) break;
      const key = resolve(next.name, next.from);
      if (!key || visited.has(key)) continue;
      visited.add(key);
      const [id = "", , meta = {}] = lock.packages[key] ?? [];
      const workspaceDir = id.split("@workspace:")[1];
      if (workspaceDir !== undefined) {
        const dependency = lock.workspaces[workspaceDir];
        if (dependency) stack.push(...edges(dependency, [dependency.name]));
        continue;
      }
      // Platform binaries are build tools (esbuild, sharp, lightningcss) and differ per machine.
      if (meta.os || meta.cpu) continue;
      const dir = installed.get(id);
      // An optional dependency no machine installs (sharp's wasm32 build) has nothing to ship.
      if (!dir && next.optional) continue;
      if (!dir) {
        stale.push(`${id} (needed as ${key}) is not installed`);
        continue;
      }
      stack.push(...edges(meta, keySegments(key)));
      if (byId.has(id)) continue;
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageJson;
      const license = declaredLicense(pkg);
      if (!isAgplCompatible(license)) rejected.push(`${id} (${license}) from ${key}`);
      const text = findFile(dir, /^(un)?licen[cs]e([-._](mit|bsd|md|txt|markdown))*$|^copying/i);
      const { copyright, body } = text ? splitLicense(text) : { copyright: [], body: null };
      const notice = findFile(dir, /^notice(\.(md|txt))?$/i)?.trim();
      byId.set(id, { name: pkg.name, version: pkg.version, license, copyright, ...(notice ? { notice } : {}), body });
    }
  }
  for (const extra of EXTRA_PACKAGES) {
    const { copyright, body } = splitLicense(readFileSync(join(ROOT, extra.file), "utf8"));
    byId.set(`${extra.name}@${extra.version}`, { name: extra.name, version: extra.version, license: extra.license, copyright, body });
  }
  return { notices: [...byId.values()], rejected, stale };
}

/** Groups packages by license text, filling a package without a license file with the text most packages of its license use. */
function groupNotices(notices: Notice[]) {
  const bodyCounts = new Map<string, Map<string, number>>();
  for (const { license, body } of notices) {
    if (body === null) continue;
    const counts = bodyCounts.get(license) ?? new Map<string, number>();
    counts.set(body, (counts.get(body) ?? 0) + 1);
    bodyCounts.set(license, counts);
  }
  const mostUsed = (license: string) =>
    [...(bodyCounts.get(license) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  // A dual-licensed package without a file takes the text of its first alternative.
  const commonBody = (license: string) => mostUsed(license) ?? mostUsed(license.match(/[\w.+-]+/)?.[0] ?? "") ?? "";
  const groups = new Map<string, { license: string; text: string; packages: Array<{ name: string; version: string; copyright: string[]; notice?: string }> }>();
  for (const { body, ...entry } of notices) {
    const text = body ?? commonBody(entry.license);
    const key = `${entry.license}\n${text}`;
    const group = groups.get(key) ?? { license: entry.license, text, packages: [] };
    group.packages.push({ name: entry.name, version: entry.version, copyright: entry.copyright, ...(entry.notice ? { notice: entry.notice } : {}) });
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort(
    (a, b) => b.packages.length - a.packages.length || a.license.localeCompare(b.license) || a.text.localeCompare(b.text),
  );
  for (const group of ordered) group.packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return ordered;
}

const POLICY_EXAMPLES: Array<[string, boolean]> = [
  ["MIT", true],
  ["(BSD-3-Clause OR GPL-2.0)", true],
  ["MIT AND Apache-2.0", true],
  ["GPL-2.0", false],
  ["MIT AND SSPL-1.0", false],
  ["Standard 'no charge' license: https://gsap.com/standard-license.", false],
];

if (import.meta.main) {
  for (const [expression, expected] of POLICY_EXAMPLES) {
    if (isAgplCompatible(expression) !== expected) throw new Error(`License policy self-test failed for ${expression}`);
  }
  const { notices, rejected, stale } = collectNotices();
  if (stale.length > 0) {
    console.error(`node_modules does not match bun.lock; run \`bun install\`:\n  ${stale.sort().join("\n  ")}`);
    process.exit(1);
  }
  if (rejected.length > 0) {
    console.error(`Licenses not compatible with AGPL-3.0 (see AGENTS.md §2):\n  ${rejected.sort().join("\n  ")}`);
    process.exit(1);
  }
  const output = `${JSON.stringify({ groups: groupNotices(notices) }, null, 1)}\n`;
  if (process.argv.includes("--check")) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : "";
    if (current !== output) {
      console.error(`${relative(ROOT, OUTPUT)} is stale; run \`bun run notices\` and commit it.`);
      process.exit(1);
    }
  } else {
    writeFileSync(OUTPUT, output);
    console.log(`Wrote ${notices.length} packages to ${relative(ROOT, OUTPUT)}`);
  }
}
