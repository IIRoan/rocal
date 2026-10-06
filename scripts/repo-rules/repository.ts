import * as path from "path";

import { type Finding, type Rule, CLIENT_SOURCE, matchLines, sourceUnder } from "./engine";

const FORBIDDEN_DEPENDENCIES: Array<[RegExp, string]> = [
  [/^(nodemailer|imapflow|node-imap|imap|imap-simple|emailjs|smtp-.*|poplib|resend)$/, "mail is JMAP-only"],
  [
    /^(posthog-.*|mixpanel.*|@segment\/.*|@amplitude\/.*|amplitude-js|@vercel\/analytics|react-ga4?|logrocket|@fullstory\/.*|hotjar.*|@datadog\/browser-rum)$/,
    "no third-party analytics or session tracking",
  ],
  [/^@tanstack\/.*-persist(er|-client)?.*$/, "query cache must not be persisted (PII at rest)"],
  [/^(zustand|redux|@reduxjs\/toolkit|jotai|mobx|recoil|valtio)$/, "state is TanStack Query + React Context"],
  [/^(yup|joi|valibot|arktype|superstruct)$/, "validation is Zod"],
  [/^(axios|ky|got|node-fetch)$/, "HTTP goes through @workspace/calendar-client / fetch"],
  [/^(moment|moment-timezone|dayjs|luxon)$/, "dates use date-fns + @workspace/calendar-core"],
  [/^(framer-motion|react-spring|@react-spring\/.*|animejs|velocity-animate)$/, "web motion uses WAAPI via @workspace/ui/lib/motion"],
  [/^(nativewind|styled-components|@emotion\/.*|@stitches\/.*)$/, "no new UI or CSS-in-JS libraries"],
];

const ALLOWED_ENV_FILES = new Set(["apps/web/.env.production"]);

export const repositoryRules: Rule[] = [
  {
    id: "forbidden-dependencies",
    summary: "Workspace manifests must not depend on banned mail, analytics, state, validation, HTTP, date, or UI libraries.",
    files: (file) => /^(apps|packages)\/[^/]+\/package\.json$/.test(file),
    check(file) {
      const manifest: Record<string, unknown> = JSON.parse(file.text);
      const findings: Finding[] = [];
      for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
        const deps = manifest[field];
        if (!deps || typeof deps !== "object") continue;
        for (const dep of Object.keys(deps)) {
          const hit = FORBIDDEN_DEPENDENCIES.find(([pattern]) => pattern.test(dep));
          if (hit) findings.push({ line: 1, message: `forbidden dependency "${dep}" (${hit[1]})` });
        }
      }
      return findings;
    },
    examples: {
      path: "apps/web/package.json",
      bad: ['{ "dependencies": { "axios": "1.0.0" } }', '{ "devDependencies": { "framer-motion": "12.0.0" } }'],
      good: ['{ "dependencies": { "zod": "3.25.0" } }'],
    },
  },
  {
    id: "no-pii-tracking-config",
    summary: "Error reporting never sends default PII, never enables IP tracking, and the query cache is never persisted.",
    files: sourceUnder(["apps/", "packages/"], /\.[cm]?[jt]sx?$/),
    check: (file) =>
      matchLines(
        file,
        /sendDefaultPii\s*:\s*true|disableIpTracking\s*:\s*false|persistQueryClient|PersistQueryClientProvider/,
        (match) => `privacy-violating configuration "${match[0]}"`,
      ),
    examples: {
      path: "apps/web/lib/errors.ts",
      bad: ["init({ sendDefaultPii: true });", "persistQueryClient({ queryClient });"],
      good: ["init({ sendDefaultPii: false });"],
    },
  },
  {
    id: "no-committed-secrets",
    summary: "Only .env*.example files (and the public web production env) and no private keys may be committed.",
    files: (file) => {
      const base = path.basename(file);
      return (base.startsWith(".env") && !base.endsWith(".example") && !ALLOWED_ENV_FILES.has(file)) || /\.(p8|pem|key)$/.test(file);
    },
    check: (file) => [
      {
        line: 1,
        message: /\.(p8|pem|key)$/.test(file.path)
          ? "private key material must not be committed"
          : "env files must not be committed (use .env*.example)",
      },
    ],
    examples: { path: "apps/backend/.env", bad: ["SECRET=1"], good: [] },
  },
  {
    id: "no-alternate-mail-transport",
    summary: "Mail runs over JMAP only: no SMTP/IMAP/POP3 URLs or Resend, and the provisioning token stays in the admin client.",
    files: sourceUnder(["apps/backend/", ...CLIENT_SOURCE, "packages/"]),
    check(file) {
      const findings = matchLines(
        file,
        /\b(smtps?|imaps?|pop3s?):\/\/|api\.resend\.com|from ["']resend["']/,
        (match) => `alternate mail transport "${match[0]}"; use JMAP (StalwartJmapClient or the backend proxy)`,
      );
      if (file.path !== "apps/backend/lib/stalwart-admin.ts" && file.path !== "apps/backend/lib/env.ts") {
        findings.push(
          ...matchLines(
            file,
            /STALWART_PROVISION_TOKEN/,
            () => "STALWART_PROVISION_TOKEN is scoped to provisioning in lib/stalwart-admin.ts; mailbox access runs as the owner",
          ),
        );
      }
      return findings;
    },
    examples: {
      path: "apps/backend/services/mail.service.ts",
      bad: ['const url = "smtp://mail.example.com";', "const token = process.env.STALWART_PROVISION_TOKEN;"],
      good: ["const jmap = await stalwartUserJmap(userId);"],
    },
  },
];
