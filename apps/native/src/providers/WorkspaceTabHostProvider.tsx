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
  /** Updates before navigation so the keep-alive host switches first. */
  activeTab: AppSwitchKey;
  /** Tab index routes render null while the host shows their content. */
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
  // Root stack routes like /event keep tabs hosted so surfaces stay mounted underneath.
  if (segments[0] !== "(tabs)") {
    return true;
  }
  // Nested tab screens like /(tabs)/mail/message/[id] must be unhosted so their stack renders.
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
