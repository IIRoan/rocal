/**
 * Mechanical enforcement of the repo rules in AGENTS.md / CLAUDE.md.
 * Runs as part of `bun run lint` (and therefore CI). Scans tracked files only.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const rootDir = path.join(__dirname, "..");
const failures: string[] = [];

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  cwd: rootDir,
  encoding: "utf8",
})
  .split("\0")
  .filter((f) => f && fs.existsSync(path.join(rootDir, f)));

const read = (file: string) => fs.readFileSync(path.join(rootDir, file), "utf8");

// 1. Agent docs are inline copies: CLAUDE.md must equal AGENTS.md in every directory.
for (const agents of trackedFiles.filter((f) => path.basename(f) === "AGENTS.md")) {
  const claude = path.join(path.dirname(agents), "CLAUDE.md");
  if (!fs.existsSync(path.join(rootDir, claude))) {
    failures.push(`${claude} is missing (must be an inline copy of ${agents})`);
  } else if (read(claude) !== read(agents)) {
    failures.push(`${claude} differs from ${agents} — run: cp ${agents} ${claude}`);
  }
}

// 2. Forbidden dependencies in workspace manifests.
const forbiddenDeps: Array<[RegExp, string]> = [
  [/^(nodemailer|imapflow|node-imap|imap|imap-simple|emailjs|smtp-.*|poplib)$/, "mail is JMAP-only"],
  [
    /^(posthog-.*|mixpanel.*|@segment\/.*|@amplitude\/.*|amplitude-js|@vercel\/analytics|react-ga4?|logrocket|@fullstory\/.*|hotjar.*|@datadog\/browser-rum)$/,
    "no third-party analytics or session tracking",
  ],
  [/^@tanstack\/.*-persist(er|-client)?.*$/, "query cache must not be persisted (PII at rest)"],
  [/^(zustand|redux|@reduxjs\/toolkit|jotai|mobx|recoil|valtio)$/, "state is TanStack Query + React Context"],
  [/^(yup|joi|valibot|arktype|superstruct)$/, "validation is Zod"],
  [/^(axios|ky|got|node-fetch)$/, "HTTP goes through @workspace/calendar-client / fetch"],
  [/^(moment|moment-timezone|dayjs|luxon)$/, "dates use date-fns + @workspace/calendar-core"],
];
for (const manifest of trackedFiles.filter((f) => /^(apps|packages)\/[^/]+\/package\.json$/.test(f))) {
  const pkg = JSON.parse(read(manifest));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  for (const dep of Object.keys(deps)) {
    const hit = forbiddenDeps.find(([pattern]) => pattern.test(dep));
    if (hit) failures.push(`${manifest}: forbidden dependency "${dep}" (${hit[1]})`);
  }
}

// 3. Forbidden source patterns.
const sourceFiles = trackedFiles.filter(
  (f) => /^(apps|packages)\//.test(f) && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f) && !f.includes("/generated/"),
);
const forbiddenSource: Array<[RegExp, string, (file: string) => boolean]> = [
  [/sendDefaultPii\s*:\s*true/, "error reporting must not send PII", () => true],
  [/persistQueryClient|PersistQueryClientProvider/, "query cache must not be persisted", () => true],
  [/from\s+["']@workspace\/mobile-ui/, "@workspace/mobile-ui is legacy", (f) => !f.startsWith("packages/mobile-ui/")],
  [/disableIpTracking\s*:\s*false/, "do not enable IP tracking", () => true],
];
for (const file of sourceFiles) {
  const content = read(file);
  for (const [pattern, reason, applies] of forbiddenSource) {
    if (applies(file) && pattern.test(content)) failures.push(`${file}: ${reason} (${pattern})`);
  }
}

// 4. Only example env files (and the public-only web production env) may be committed.
const allowedEnv = new Set(["apps/web/.env.production"]);
for (const file of trackedFiles) {
  const base = path.basename(file);
  if (base.startsWith(".env") && !base.endsWith(".example") && !allowedEnv.has(file)) {
    failures.push(`${file}: env files must not be committed (use .env*.example)`);
  }
}
if (trackedFiles.some((f) => /\.(p8|pem|key)$/.test(f) && !f.endsWith(".pub"))) {
  failures.push("private key material (.p8/.pem/.key) is committed");
}

if (failures.length > 0) {
  console.error(`Repo rule violations (see AGENTS.md):\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("Repo rules: OK");
