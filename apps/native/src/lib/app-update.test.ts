import { describe, expect, it } from "@jest/globals";
import {
  actionLabel,
  checkStatusDetail,
  copyForPhase,
  formatChannelLabel,
  formatCheckUnavailableReason,
  formatDownloadPercent,
  formatUpdateId,
  formatUpdateStamp,
  isDevelopmentModeCheckError,
  jsSourceLabel,
  resolveAppUpdateAction,
  resolveAppUpdatePhase,
  resolveAppVariant,
  updateDiagnosticsBody,
  updateDiagnosticsTitle,
  type AppUpdateRuntimeInfo,
  type AppUpdateSnapshot,
} from "./app-update";

const base: AppUpdateSnapshot = {
  enabled: true,
  isRestarting: false,
  isDownloading: false,
  isUpdatePending: false,
  isUpdateAvailable: false,
  downloadError: false,
  dismissed: false,
};

describe("resolveAppUpdatePhase", () => {
  it("stays idle when updates are disabled", () => {
    expect(
      resolveAppUpdatePhase({
        ...base,
        enabled: false,
        isUpdateAvailable: true,
      }),
    ).toBe("idle");
  });

  it("shows available when a newer bundle is on the channel", () => {
    expect(resolveAppUpdatePhase({ ...base, isUpdateAvailable: true })).toBe(
      "available",
    );
  });

  it("hides available after Later", () => {
    expect(
      resolveAppUpdatePhase({
        ...base,
        isUpdateAvailable: true,
        dismissed: true,
      }),
    ).toBe("idle");
  });

  it("keeps downloading visible; Later hides ready until the next launch", () => {
    expect(
      resolveAppUpdatePhase({
        ...base,
        isUpdateAvailable: true,
        isDownloading: true,
        dismissed: true,
      }),
    ).toBe("downloading");
    expect(
      resolveAppUpdatePhase({
        ...base,
        isUpdatePending: true,
        dismissed: true,
      }),
    ).toBe("idle");
    expect(resolveAppUpdatePhase({ ...base, isUpdatePending: true })).toBe(
      "ready",
    );
  });

  it("prioritizes restarting and download error", () => {
    expect(
      resolveAppUpdatePhase({
        ...base,
        isRestarting: true,
        isDownloading: true,
      }),
    ).toBe("restarting");
    expect(
      resolveAppUpdatePhase({
        ...base,
        downloadError: true,
        isUpdateAvailable: true,
      }),
    ).toBe("error");
  });

  it("closes a failed download after Later", () => {
    expect(
      resolveAppUpdatePhase({ ...base, downloadError: true, dismissed: true }),
    ).toBe("idle");
  });
});

describe("resolveAppUpdateAction", () => {
  it("keeps install and restart after Later so Settings can finish this session", () => {
    expect(
      resolveAppUpdateAction({
        ...base,
        isUpdateAvailable: true,
        dismissed: true,
      }),
    ).toBe("available");
    expect(
      resolveAppUpdateAction({
        ...base,
        isUpdatePending: true,
        dismissed: true,
      }),
    ).toBe("ready");
    expect(
      resolveAppUpdateAction({ ...base, downloadError: true, dismissed: true }),
    ).toBe("error");
  });

  it("stays idle when nothing is waiting", () => {
    expect(resolveAppUpdateAction({ ...base, dismissed: true })).toBe("idle");
  });
});

describe("update labels", () => {
  it("formats channel, id, download percent, and action copy", () => {
    expect(formatChannelLabel("testing")).toBe("TESTING");
    expect(formatChannelLabel(null)).toBe("LOCAL");
    expect(formatChannelLabel(null, "development")).toBe("DEVELOPMENT");
    expect(formatChannelLabel("master")).toBe("MASTER");
    expect(formatUpdateId("abcdefghijklmnop")).toBe("abcdefgh…");
    expect(formatUpdateId("short")).toBe("short");
    expect(formatDownloadPercent(0.42)).toBe(42);
    expect(formatDownloadPercent(undefined)).toBe(0);
    expect(actionLabel(false, "available")).toBe("Updates off in this build");
    expect(actionLabel(true, "ready")).toBe("Restart to apply");
    expect(actionLabel(true, "idle")).toBe("Check for update");
    expect(actionLabel(true, "idle", "checking")).toBe("Checking…");
    expect(actionLabel(true, "idle", "current")).toBe("You're up to date");
    expect(actionLabel(true, "idle", "failed")).toBe("Check failed — try again");
    expect(formatUpdateStamp(null)).toBe("Embedded build");
  });
});

describe("checkStatusDetail", () => {
  it("explains a user-initiated check and its result", () => {
    expect(checkStatusDetail(true, "idle", "checking", "PREVIEW", null)).toBe(
      "Looking for a newer bundle on PREVIEW.",
    );
    expect(checkStatusDetail(true, "idle", "current", "PREVIEW", null)).toBe(
      "Nothing newer on PREVIEW.",
    );
    expect(
      checkStatusDetail(true, "idle", "failed", "PREVIEW", "timed out"),
    ).toBe("timed out");
    expect(checkStatusDetail(false, "idle", "idle", "DEVELOPMENT", null)).toBe(
      "Tap for why this binary is not using EAS Updates.",
    );
  });
});

describe("development diagnostics", () => {
  const metroDev: AppUpdateRuntimeInfo = {
    appVariant: "development",
    updatesEnabled: false,
    channel: null,
    runtimeVersion: "abc123",
    updateId: null,
    createdAt: null,
    isEmbeddedLaunch: true,
    executionEnvironment: "bare",
  };

  it("names Solace Dev and Metro as the JS source", () => {
    expect(resolveAppVariant("development")).toBe("development");
    expect(jsSourceLabel(metroDev)).toBe("Metro bundler");
    expect(updateDiagnosticsTitle(metroDev)).toBe("Solace Dev");
    expect(updateDiagnosticsBody(metroDev)).toContain("onl.solace.mobile.dev");
    expect(updateDiagnosticsBody(metroDev)).toContain("Quit the bundler");
    expect(formatChannelLabel(metroDev.channel, metroDev.appVariant)).toBe(
      "DEVELOPMENT",
    );
  });

  it("maps server not-available reasons and Metro check errors", () => {
    expect(formatCheckUnavailableReason("noUpdateAvailableOnServer")).toBe(
      "You're up to date",
    );
    expect(
      formatCheckUnavailableReason("updateRejectedBySelectionPolicy"),
    ).toContain("does not match this binary");
    expect(
      isDevelopmentModeCheckError(
        "You cannot check for updates in development mode",
      ),
    ).toBe(true);
    expect(isDevelopmentModeCheckError("Network request failed")).toBe(false);
  });
});

describe("copyForPhase", () => {
  it("names the waiting channel and install path", () => {
    expect(copyForPhase("available", "PREVIEW", null)).toEqual({
      kicker: "Channel PREVIEW",
      title: "Update available",
      body: "A newer bundle is waiting on this channel. Install it, then restart to apply.",
      primary: "Install update",
      secondary: "Later",
    });
  });

  it("uses the download error when the bundle did not land", () => {
    expect(copyForPhase("error", "MASTER", "  timed out  ").body).toBe(
      "timed out",
    );
    expect(copyForPhase("error", "MASTER", null).primary).toBe("Try again");
  });

  it("stays empty while idle", () => {
    expect(copyForPhase("idle", "MASTER", null).title).toBe("");
  });
});
