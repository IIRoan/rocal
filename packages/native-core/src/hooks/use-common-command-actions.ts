import { useCallback } from "react";
import { useRouter } from "expo-router";
import { getErrorMessage, settingsSectionPath } from "@workspace/calendar-core";
import type { CommonCommandAction } from "../lib/command-palette-common";
import { useAuth } from "../providers/AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";

/** Runs the theme, passkey, and settings commands both palettes share; returns false for app-specific actions. */
export function useCommonCommandActions() {
  const router = useRouter();
  const { registerPasskey } = useAuth();
  const { setThemePreference } = useTheme();
  const { toast } = useToast();

  const addPasskey = useCallback(async () => {
    try {
      await registerPasskey();
      toast("Passkey added");
    } catch (error) {
      toast(getErrorMessage(error, "Failed to add passkey"), "error");
    }
  }, [registerPasskey, toast]);

  return useCallback(
    (action: Pick<CommonCommandAction, "theme" | "settingsSection"> & {
      id: string;
    }): boolean => {
      if (action.theme) {
        setThemePreference(action.theme);
        return true;
      }
      if (action.settingsSection) {
        router.push(settingsSectionPath(action.settingsSection) as never);
        return true;
      }
      if (action.id === "add-passkey") {
        void addPasskey();
        return true;
      }
      return false;
    },
    [addPasskey, router, setThemePreference],
  );
}
