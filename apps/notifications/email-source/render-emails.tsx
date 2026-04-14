import { render } from "@react-email/render";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { createLogger } from "@workspace/logger";
import { EventReminderEmailTemplate } from "./event-reminder-email.js";

const log = createLogger("render-emails");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, "../emails");

async function main() {
  await mkdir(outputDir, { recursive: true });

  const eventReminderHtml = await render(<EventReminderEmailTemplate />, {
    pretty: true,
  });

  await writeFile(
    path.join(outputDir, "event-reminder.html"),
    eventReminderHtml,
    "utf8",
  );
}

main().catch((error) => {
  log.error(error);
  process.exitCode = 1;
});
