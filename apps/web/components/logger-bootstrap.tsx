"use client";

import { installGlobalConsoleLogger } from "@workspace/logger";

if (typeof window !== "undefined") {
  installGlobalConsoleLogger("web");
}

export function LoggerBootstrap() {
  return null;
}
