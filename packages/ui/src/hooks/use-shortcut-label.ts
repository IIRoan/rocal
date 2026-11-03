"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

export function isApplePlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

/** Formats a Cmd/Ctrl shortcut the way the platform writes it: ⌘S on Apple devices, Ctrl+S elsewhere. */
export function formatShortcut(key: string, apple: boolean): string {
  return apple ? `⌘${key}` : `Ctrl+${key}`;
}

/** The server render assumes Apple; the client corrects it after hydration. */
export function useIsApplePlatform(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => isApplePlatform(navigator.platform || navigator.userAgent),
    () => true,
  );
}

export function useShortcutLabel(key: string): string {
  return formatShortcut(key, useIsApplePlatform());
}
