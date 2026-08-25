"use client";

import { LOGIN_PATH } from "@/lib/app-routes";

const PASSKEY_BRIDGE_PATH = "/passkey/native";
const RESET_PASSWORD_PATH = "/reset-password";

export function completeAuthNavigation(href: string) {
  window.location.replace(href);
}

export function isPasskeyStepUpExemptPath(pathname: string): boolean {
  return (
    pathname === LOGIN_PATH ||
    pathname.startsWith(`${LOGIN_PATH}/`) ||
    pathname === PASSKEY_BRIDGE_PATH ||
    pathname.startsWith(`${PASSKEY_BRIDGE_PATH}/`) ||
    pathname === RESET_PASSWORD_PATH ||
    pathname.startsWith(`${RESET_PASSWORD_PATH}/`)
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
