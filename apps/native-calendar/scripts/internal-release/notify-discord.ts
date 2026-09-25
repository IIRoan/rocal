#!/usr/bin/env bun
/** Posts the install QR and page link to the team Discord webhook. */
import { getArg } from "./install-artifacts";
import { requiredEnv } from "./r2";

function arg(argv: string[], flag: string): string {
  const value = getArg(argv, flag);
  if (!value) {
    throw new Error(`Missing ${flag}`);
  }
  return value;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const webhook = requiredEnv("DISCORD_WEBHOOK");
  const qrPath = arg(argv, "--qr");
  const profile = arg(argv, "--profile");
  const title = arg(argv, "--title");
  const ref = arg(argv, "--ref");
  const url = getArg(argv, "--url");

  const qr = Bun.file(qrPath);
  if (!(await qr.exists())) {
    throw new Error(`QR file not found: ${qrPath}`);
  }

  const lines = [
    `**${title}** internal build ready (\`${profile}\`)`,
    "Scan → open the page → iPhone taps Install (registered ad-hoc), Android downloads the APK.",
  ];
  if (url) {
    lines.push(`Install page: ${url}`);
  }
  lines.push(ref);

  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: lines.join("\n") }));
  form.append("files[0]", qr, `${profile}-qr.png`);

  const response = await fetch(webhook, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`Discord webhook failed (${String(response.status)})`);
  }
  console.log("Discord webhook delivered");
}

if (import.meta.main) {
  await main();
}
