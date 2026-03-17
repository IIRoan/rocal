"use client";

import { useEffect } from "react";
import { installGlobalConsoleLogger } from "@workspace/logger";

export function LoggerBootstrap() {
  useEffect(() => {
    installGlobalConsoleLogger("web");
  }, []);

  return null;
}
