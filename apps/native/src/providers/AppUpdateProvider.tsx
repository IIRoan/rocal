import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import {
  formatCheckUnavailableReason,
  isDevelopmentModeCheckError,
  resolveAppUpdateAction,
  resolveAppUpdatePhase,
  resolveAppVariant,
  type AppUpdateCheckStatus,
  type AppUpdatePhase,
  type AppUpdateRuntimeInfo,
} from "../lib/app-update";

export type AppUpdateCheckOrigin = "silent" | "user";

export type AppUpdateCheckOutcome =
  | "disabled"
  | "available"
  | "current"
  | "failed"
  | "development-mode";

type AppUpdateValue = {
  enabled: boolean;
  phase: AppUpdatePhase;
  action: AppUpdatePhase;
  checkStatus: AppUpdateCheckStatus;
  checkError: string | null;
  channel: string | null;
  downloadProgress: number | undefined;
  errorMessage: string | null;
  runtime: AppUpdateRuntimeInfo;
  check: (origin?: AppUpdateCheckOrigin) => Promise<AppUpdateCheckOutcome>;
  install: () => Promise<void>;
  restart: () => Promise<void>;
  dismiss: () => void;
};

const AppUpdateContext = createContext<AppUpdateValue | null>(null);

export function useAppUpdate(): AppUpdateValue {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) {
    throw new Error("useAppUpdate must be used within AppUpdateProvider");
  }
  return ctx;
}

function readRuntime(enabled: boolean): AppUpdateRuntimeInfo {
  const extra = Constants.expoConfig?.extra as { appVariant?: unknown } | undefined;
  const runtimeVersion = Updates.runtimeVersion;
  const configRuntime = Constants.expoConfig?.runtimeVersion;

  return {
    appVariant: resolveAppVariant(extra?.appVariant),
    updatesEnabled: enabled,
    channel: Updates.channel ?? null,
    runtimeVersion:
      (typeof runtimeVersion === "string" && runtimeVersion) ||
      (typeof configRuntime === "string" && configRuntime) ||
      null,
    updateId: Updates.updateId ?? null,
    createdAt: Updates.createdAt ?? null,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    executionEnvironment:
      Constants.executionEnvironment != null
        ? String(Constants.executionEnvironment)
        : null,
  };
}

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const updates = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [checkStatus, setCheckStatus] = useState<AppUpdateCheckStatus>("idle");
  const [checkError, setCheckError] = useState<string | null>(null);
  const enabled = Updates.isEnabled && Platform.OS !== "web";

  const snapshot = {
    enabled,
    isRestarting: updates.isRestarting,
    isDownloading: updates.isDownloading,
    isUpdatePending: updates.isUpdatePending,
    isUpdateAvailable: updates.isUpdateAvailable,
    downloadError: Boolean(updates.downloadError),
    dismissed,
  };
  const phase = resolveAppUpdatePhase(snapshot);
  const action = resolveAppUpdateAction(snapshot);
  const runtime = useMemo(() => readRuntime(enabled), [enabled]);

  const check = useCallback(
    async (origin: AppUpdateCheckOrigin = "silent"): Promise<AppUpdateCheckOutcome> => {
      if (!enabled) {
        if (origin === "user") {
          setCheckStatus("idle");
          setCheckError(null);
        }
        return "disabled";
      }

      if (origin === "user") {
        setCheckStatus("checking");
        setCheckError(null);
      }

      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable || result.isRollBackToEmbedded) {
          if (origin === "user") {
            setCheckStatus("idle");
            setCheckError(null);
          }
          return "available";
        }

        if (origin === "user") {
          const reason = formatCheckUnavailableReason(result.reason);
          setCheckStatus("current");
          setCheckError(reason === "You're up to date" ? null : reason);
        }
        return "current";
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The update server did not respond.";
        if (origin === "user") {
          setCheckStatus("failed");
          setCheckError(message);
        }
        return isDevelopmentModeCheckError(message)
          ? "development-mode"
          : "failed";
      }
    },
    [enabled],
  );

  const install = useCallback(async () => {
    if (!enabled) return;
    setDismissed(false);
    setCheckStatus("idle");
    try {
      await Updates.fetchUpdateAsync();
    } catch {
      // downloadError is exposed via useUpdates.
    }
  }, [enabled]);

  const restart = useCallback(async () => {
    if (!enabled) return;
    try {
      await Updates.reloadAsync();
    } catch {
      // reloadAsync rejects in Expo Go / Metro; Settings already explains that.
    }
  }, [enabled]);

  useEffect(() => {
    void check("silent");
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void check("silent");
    });
    return () => sub.remove();
  }, [check]);

  const value = useMemo<AppUpdateValue>(
    () => ({
      enabled,
      phase,
      action,
      checkStatus,
      checkError,
      channel: Updates.channel ?? null,
      downloadProgress: updates.downloadProgress,
      errorMessage: updates.downloadError?.message ?? null,
      runtime,
      check,
      install,
      restart,
      dismiss: () => setDismissed(true),
    }),
    [
      enabled,
      phase,
      action,
      checkStatus,
      checkError,
      updates.downloadProgress,
      updates.downloadError?.message,
      runtime,
      check,
      install,
      restart,
    ],
  );

  return (
    <AppUpdateContext.Provider value={value}>
      {children}
    </AppUpdateContext.Provider>
  );
}
