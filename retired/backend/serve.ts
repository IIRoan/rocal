/** Local long-running entry; Vercel builds from main.ts via app.ts and must never call `.listen()`. */
import { Manifest } from "elysia";
import { createLogger } from "@workspace/logger";
import { env } from "./lib/env";
import { createStalwartAdminClient } from "./lib/stalwart-admin";
import { errorLogDetails } from "./lib/log-sanitization";
import app from "./main";

// Elysia AOT capture requires the entrypoint's default export to be the app
export default app;

const logger = createLogger("backend");
const { backendUrl, frontendUrl, port } = env;

async function ensureStalwartWebhookOnBoot() {
  if (!env.stalwartWebhookSecret || !env.stalwartProvisionToken) {
    return;
  }

  try {
    await createStalwartAdminClient().ensureMailIngestWebhook({
      url: env.stalwartWebhookUrl,
      secret: env.stalwartWebhookSecret,
    });
  } catch (error) {
    logger.warn(
      "Failed to ensure Stalwart mail ingest webhook",
      errorLogDetails(error),
    );
  }
}

if (!Manifest.isCapturing()) {
  app.listen(port, () => {
    logger.ok(`Server is running on ${backendUrl}`);
    logger.info("Auth runtime config", {
      backendUrl,
      frontendUrl,
      cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE || "lax",
      nodeEnv: process.env.NODE_ENV || "development",
    });

    void ensureStalwartWebhookOnBoot();
  });
}
