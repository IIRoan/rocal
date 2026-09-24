#!/usr/bin/env bun
/** Builds the combined iOS + Android install page and its QR code, and uploads both to R2. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROFILES,
  buildCombinedInstallPage,
  buildItmsInstallUrl,
  getArg,
  isProfile,
  releaseKeys,
} from "./install-artifacts";
import { createClient, resolveUrl } from "./r2";

const USAGE =
  "Usage: publish-page --profile <development|preview> --title <title> [--out-dir <dir>]";

function parseArgs(argv: string[]) {
  const profile = getArg(argv, "--profile");
  if (!isProfile(profile)) {
    throw new Error(`--profile must be one of: ${PROFILES.join(", ")}`);
  }
  const title = getArg(argv, "--title");
  const outDir = getArg(argv, "--out-dir") ?? process.env.RUNNER_TEMP ?? "/tmp";
  if (!title) {
    throw new Error(USAGE);
  }
  return { profile, title, outDir };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const keys = releaseKeys(args.profile);
  const client = createClient();

  const [hasPlist, hasApk] = await Promise.all([
    client.exists(keys.plist),
    client.exists(keys.apk),
  ]);
  const iosInstallUrl = hasPlist
    ? buildItmsInstallUrl(resolveUrl(client, keys.plist))
    : null;
  const androidApkUrl = hasApk ? resolveUrl(client, keys.apk) : null;
  if (!iosInstallUrl && !androidApkUrl) {
    throw new Error(
      `No installable artifacts found for ${args.profile}; expected ${keys.plist} or ${keys.apk}`,
    );
  }

  const pageBody = buildCombinedInstallPage({
    title: args.title,
    profile: args.profile,
    iosInstallUrl,
    androidApkUrl,
  });
  mkdirSync(args.outDir, { recursive: true });
  writeFileSync(join(args.outDir, `${args.profile}.html`), pageBody, "utf8");
  await client.write(keys.page, pageBody, { type: "text/html; charset=utf-8" });

  const pageUrl = resolveUrl(client, keys.page);
  const qrPath = join(args.outDir, `${args.profile}-qr.png`);
  // qrencode comes from the runner's signed apt archive, not npm, so no unlocked package runs next to the R2 keys.
  const qrProc = Bun.spawn(["qrencode", "-s", "12", "-o", qrPath, pageUrl], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const qrExit = await qrProc.exited;
  if (qrExit !== 0) {
    throw new Error(`qrencode exited ${String(qrExit)}`);
  }
  await client.write(keys.qr, Bun.file(qrPath), { type: "image/png" });

  const result = {
    profile: args.profile,
    pageKey: keys.page,
    pageUrl,
    qrKey: keys.qr,
    qrPath,
    ios: Boolean(iosInstallUrl),
    android: Boolean(androidApkUrl),
  };
  writeFileSync(
    join(args.outDir, "publish-page.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  await main();
}
