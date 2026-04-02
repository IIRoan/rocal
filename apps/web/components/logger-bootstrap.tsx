"use client";

import { Capacitor } from "@capacitor/core";
import { installGlobalConsoleLogger } from "@workspace/logger";

const CAPACITOR_NATIVE_NOISE_PATTERNS = [
  "not implemented",
  "Scripts inside React components",
  "Encountered a script tag while rendering React component",
];

function extractStrings(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.message;
      if (a === null || a === undefined) return "";
      if (typeof a === "string") return a;
      if (typeof a === "object") {
        try {
          return JSON.stringify(a);
        } catch {
          return Object.prototype.toString.call(a);
        }
      }
      return String(a);
    })
    .join(" ");
}

function isNoiseMessage(args: unknown[]): boolean {
  const message = extractStrings(args);
  return CAPACITOR_NATIVE_NOISE_PATTERNS.some((p) => message.includes(p));
}

if (typeof window !== "undefined") {
  if (Capacitor.isNativePlatform()) {
    const trueError = console.error.bind(console);
    const trueWarn = console.warn.bind(console);

    console.error = (...args: unknown[]) => {
      if (!isNoiseMessage(args)) trueError(...args);
    };
    console.warn = (...args: unknown[]) => {
      if (!isNoiseMessage(args)) trueWarn(...args);
    };
  }

  installGlobalConsoleLogger("web");
}

export function LoggerBootstrap() {
  return null;
}
