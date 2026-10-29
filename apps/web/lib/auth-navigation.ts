"use client";

import { LOGIN_PATH } from "@/lib/app-routes";

const PASSKEY_BRIDGE_PATH = "/passkey/native";

let pendingNavigation: { completed: boolean } | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) pendingNavigation = null;
  });
}

export function isAuthNavigationPending(): boolean {
  return pendingNavigation !== null;
}

/** Reserve the redirect before auth changes so session guards cannot navigate ahead of cleanup. */
export function beginAuthNavigation(href: string): (() => void) | null {
  if (pendingNavigation) return null;
  const navigation = { completed: false };
  pendingNavigation = navigation;

  return () => {
    if (pendingNavigation !== navigation || navigation.completed) return;
    navigation.completed = true;
    try {
      window.location.replace(href);
    } catch (error) {
      pendingNavigation = null;
      throw error;
    }
  };
}

export function completeAuthNavigation(href: string) {
  beginAuthNavigation(href)?.();
}

export function isPasskeyBridgePath(
  pathname: string | null | undefined,
): boolean {
  return (
    pathname === PASSKEY_BRIDGE_PATH ||
    Boolean(pathname?.startsWith(`${PASSKEY_BRIDGE_PATH}/`))
  );
}

export function isPasskeyStepUpExemptPath(
  pathname: string | null | undefined,
): boolean {
  if (!pathname) {
    return false;
  }
  return (
    pathname === LOGIN_PATH ||
    pathname.startsWith(`${LOGIN_PATH}/`) ||
    isPasskeyBridgePath(pathname)
  );
}

export function buildPasskeyStepUpLoginHref(currentPath: string): string {
  const params = new URLSearchParams();
  const pathname = currentPath.split("?")[0] ?? currentPath;
  if (currentPath.startsWith("/") && !isPasskeyStepUpExemptPath(pathname)) {
    params.set("next", currentPath);
  }
  params.set("stepUp", "1");
  return `${LOGIN_PATH}?${params.toString()}`;
}

/** Why a session that could not open the account key was ended; the login page shows the matching notice. */
export type E2eeLockReason = "sign-in" | "failed";

export function buildE2eeLockLoginHref(reason: E2eeLockReason): string {
  return `${LOGIN_PATH}?e2ee=${reason}`;
}

export function redirectToPasskeyStepUpLogin(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (isPasskeyStepUpExemptPath(window.location.pathname)) {
    return;
  }

  completeAuthNavigation(
    buildPasskeyStepUpLoginHref(
      `${window.location.pathname}${window.location.search}`,
    ),
  );
}
