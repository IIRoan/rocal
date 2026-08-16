export type AppUpdatePhase =
  | "idle"
  | "available"
  | "downloading"
  | "ready"
  | "restarting"
  | "error";

export type AppUpdateSnapshot = {
  enabled: boolean;
  isRestarting: boolean;
  isDownloading: boolean;
  isUpdatePending: boolean;
  isUpdateAvailable: boolean;
  downloadError: boolean;
  dismissed: boolean;
};

export function resolveAppUpdatePhase(
  snapshot: AppUpdateSnapshot,
): AppUpdatePhase {
  if (!snapshot.enabled) return "idle";
  if (snapshot.isRestarting) return "restarting";
  if (snapshot.isDownloading) return "downloading";
  if (snapshot.downloadError && !snapshot.dismissed) return "error";
  if (snapshot.isUpdatePending && !snapshot.dismissed) return "ready";
  if (snapshot.isUpdateAvailable && !snapshot.dismissed) return "available";
  return "idle";
}

/**
 * Settings CTA — Later only hides the full-screen dispatch.
 * A waiting bundle or failed download can still be installed this session.
 */
export function resolveAppUpdateAction(
  snapshot: AppUpdateSnapshot,
): AppUpdatePhase {
  return resolveAppUpdatePhase({ ...snapshot, dismissed: false });
}

export type AppVariant = "development" | "preview" | "production";

export type AppUpdateCheckStatus = "idle" | "checking" | "current" | "failed";

export type AppUpdateRuntimeInfo = {
  appVariant: AppVariant;
  updatesEnabled: boolean;
  channel: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  createdAt: Date | null;
  isEmbeddedLaunch: boolean;
  executionEnvironment: string | null;
};

export function resolveAppVariant(value: unknown): AppVariant {
  if (value === "development" || value === "preview" || value === "production") {
    return value;
  }
  return "production";
}

export function formatChannelLabel(
  channel: string | null | undefined,
  appVariant?: AppVariant | null,
): string {
  const value = channel?.trim();
  if (value) return value.toUpperCase();
  if (appVariant === "development") return "DEVELOPMENT";
  return "LOCAL";
}

export function formatUpdateId(id: string | null | undefined): string {
  if (!id) return "embedded";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function formatDownloadPercent(progress: number | undefined): number {
  if (progress === undefined || Number.isNaN(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

export function actionLabel(
  enabled: boolean,
  phase: AppUpdatePhase,
  checkStatus: AppUpdateCheckStatus = "idle",
): string {
  if (!enabled) return "Updates off in this build";
  if (phase === "downloading" || phase === "restarting") return "Installing…";
  if (phase === "ready") return "Restart to apply";
  if (phase === "available" || phase === "error") return "Install update";
  if (checkStatus === "checking") return "Checking…";
  if (checkStatus === "current") return "You're up to date";
  if (checkStatus === "failed") return "Check failed — try again";
  return "Check for update";
}

export function checkStatusDetail(
  enabled: boolean,
  phase: AppUpdatePhase,
  checkStatus: AppUpdateCheckStatus,
  channelLabel: string,
  errorMessage: string | null,
): string | null {
  if (!enabled) {
    return "Tap for why this binary is not using EAS Updates.";
  }
  if (phase !== "idle") return null;
  if (checkStatus === "checking") {
    return `Looking for a newer bundle on ${channelLabel}.`;
  }
  if (checkStatus === "current") {
    return errorMessage?.trim() || `Nothing newer on ${channelLabel}.`;
  }
  if (checkStatus === "failed") {
    return errorMessage?.trim() || "The update server did not respond.";
  }
  return null;
}

export function jsSourceLabel(info: AppUpdateRuntimeInfo): string {
  if (info.executionEnvironment === "storeClient") return "Expo Go";
  if (!info.updatesEnabled) return "Metro bundler";
  if (info.isEmbeddedLaunch) return "Embedded binary";
  return "EAS Update";
}

export function updateDiagnosticsTitle(info: AppUpdateRuntimeInfo): string {
  if (info.appVariant === "development") return "Solace Dev";
  if (!info.updatesEnabled) return "Updates off";
  return "App update";
}

export function updateDiagnosticsBody(info: AppUpdateRuntimeInfo): string {
  const channel = formatChannelLabel(info.channel, info.appVariant);
  const lines = [
    info.appVariant === "development"
      ? "This binary is Solace Dev (`onl.solace.mobile.dev`)."
      : "This is the production Solace binary.",
    "",
    `Channel: ${channel}`,
    `Runtime: ${info.runtimeVersion?.trim() || "unknown"}`,
    `Update: ${formatUpdateId(info.updateId)}`,
    `Published: ${info.createdAt ? formatUpdateStamp(info.createdAt) : jsSourceLabel(info)}`,
    `Source: ${jsSourceLabel(info)}`,
  ];

  if (!info.updatesEnabled) {
    lines.push("");
    if (info.executionEnvironment === "storeClient") {
      lines.push(
        "Expo Go cannot install Solace OTAs. Use a Solace or Solace Dev build.",
      );
    } else if (info.appVariant === "development") {
      lines.push(
        "EAS Updates are off while Metro is serving JavaScript. Quit the bundler and open Solace Dev from the home screen to receive OTAs on the development channel.",
      );
    } else {
      lines.push(
        "EAS Updates are off in this session. The embedded bundle stays loaded.",
      );
    }
  } else if (info.appVariant === "development") {
    lines.push("");
    lines.push(
      "Checks use the development EAS channel. A matching native fingerprint is required.",
    );
  }

  return lines.join("\n");
}

export function formatCheckUnavailableReason(
  reason: string | undefined,
): string {
  switch (reason) {
    case "updateRejectedBySelectionPolicy":
      return "A newer bundle is on the server but it does not match this binary.";
    case "updatePreviouslyFailed":
      return "A newer bundle is on the server but a previous install failed on this device.";
    case "rollbackRejectedBySelectionPolicy":
      return "The server asked to roll back, but this binary rejected it.";
    case "rollbackNoEmbeddedConfiguration":
      return "The server asked to roll back, but this binary has no embedded bundle.";
    default:
      return "You're up to date";
  }
}

export function isDevelopmentModeCheckError(message: string | null): boolean {
  if (!message) return false;
  return /development mode|expo go|updates are (not )?enabled|not enabled/i.test(
    message,
  );
}

export type AppUpdatePhaseCopy = {
  kicker: string;
  title: string;
  body: string;
  primary?: string;
  secondary?: string;
};

export function copyForPhase(
  phase: AppUpdatePhase,
  channelLabel: string,
  errorMessage: string | null,
): AppUpdatePhaseCopy {
  switch (phase) {
    case "available":
      return {
        kicker: `Channel ${channelLabel}`,
        title: "Update available",
        body: "A newer bundle is waiting on this channel. Install it, then restart to apply.",
        primary: "Install update",
        secondary: "Later",
      };
    case "downloading":
      return {
        kicker: "Receiving",
        title: "Installing",
        body: "Keep the app open until the download finishes.",
      };
    case "ready":
      return {
        kicker: "Ready",
        title: "Restart to apply",
        body: "The new bundle is on this device. Restart loads it.",
        primary: "Restart",
        secondary: "Later",
      };
    case "restarting":
      return {
        kicker: "Applying",
        title: "Restarting",
        body: "Loading the new bundle.",
      };
    case "error":
      return {
        kicker: "Failed",
        title: "Update did not land",
        body: errorMessage?.trim() || "The download did not finish. Try again.",
        primary: "Try again",
        secondary: "Later",
      };
    default:
      return { kicker: "", title: "", body: "" };
  }
}

export function formatUpdateStamp(value: Date | null | undefined): string {
  if (!value) return "Embedded build";
  try {
    return value.toLocaleString();
  } catch {
    return value.toISOString();
  }
}
