import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Href } from "expo-router";
import { useRouter, useSegments } from "expo-router";
import {
  getAppSwitchOption,
  type AppSwitchKey,
} from "../lib/app-switcher-config";

interface WorkspaceTabHostContextValue {
  /** Tab shown by the keep-alive host (updates before navigation). */
  activeTab: AppSwitchKey;
  /** True on calendar/mail list routes — index routes render null; host shows content. */
  isHosted: boolean;
  switchTab: (key: AppSwitchKey) => void;
}

const WorkspaceTabHostContext =
  createContext<WorkspaceTabHostContextValue | null>(null);

function tabFromSegments(segments: readonly string[]): AppSwitchKey | null {
  if (segments[0] === "(tabs)") {
    return segments[1] === "mail" ? "mail" : "calendar";
  }
  return null;
}

function isHostedSegments(segments: readonly string[]): boolean {
  // If not inside (tabs) (e.g. root stack routes like /event or /settings),
  // keep tabs hosted so surfaces remain mounted in the background.
  if (segments[0] !== "(tabs)") {
    return true;
  }
  // Inside (tabs), only root tab screens (length === 2) are hosted.
  // Nested screens (e.g. /(tabs)/mail/message/[id]) need isHosted = false so the nested stack renders.
  return segments.length === 2;
}

export function WorkspaceTabHostProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const segments = useSegments();
  const routeTab = tabFromSegments(segments);
  const isHosted = isHostedSegments(segments);
  const [activeTab, setActiveTab] = useState<AppSwitchKey>(
    routeTab ?? "calendar",
  );

  useEffect(() => {
    if (routeTab) {
      setActiveTab(routeTab);
    }
  }, [routeTab]);

  const switchTab = useCallback(
    (key: AppSwitchKey) => {
      setActiveTab(key);
      const href = getAppSwitchOption(key).href as Href;
      requestAnimationFrame(() => {
        router.navigate(href);
      });
    },
    [router],
  );

  const value = useMemo(
    () => ({
      activeTab,
      isHosted,
      switchTab,
    }),
    [activeTab, isHosted, switchTab],
  );

  return (
    <WorkspaceTabHostContext.Provider value={value}>
      {children}
    </WorkspaceTabHostContext.Provider>
  );
}

export function useWorkspaceTabHost(): WorkspaceTabHostContextValue {
  const ctx = useContext(WorkspaceTabHostContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceTabHost must be used within WorkspaceTabHostProvider",
    );
  }
  return ctx;
}
