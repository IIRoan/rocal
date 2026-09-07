import * as Sentry from "@sentry/nextjs";

import { getWebSentryOptions } from "./lib/sentry-options";

const options = getWebSentryOptions();
if (options) {
  Sentry.init(options);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
