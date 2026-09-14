import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  getAppSwitchOption,
  type AppSwitchKey,
} from "../lib/app-switcher-config";
import { prefetchWorkspaceTabs } from "../lib/workspace-tab-prefetch";
import { useWorkspaceTabSwitch } from "../lib/use-workspace-tab-switch";
import { useTheme } from "../providers/ThemeProvider";
import {
  AppSwitchMenu,
  type AppSwitchMenuAnchor,
} from "./AppSwitchMenu";
import { LAYOUT_ICON, layoutTitleStyle } from "../lib/app-layout";

interface SurfaceAppSwitcherTitleProps {
  activeApp: AppSwitchKey;
  /** Called after navigation (e.g. close a drawer). */
  onNavigate?: () => void;
}

/**
 * Tappable app title for tab toolbars. Opens a popover to switch Calendar ↔ Mail.
 */
export function SurfaceAppSwitcherTitle({
  activeApp,
  onNavigate,
}: SurfaceAppSwitcherTitleProps) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const switchTab = useWorkspaceTabSwitch();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const triggerRef = useRef<View>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDismissInstant, setMenuDismissInstant] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AppSwitchMenuAnchor | null>(
    null,
  );

  const active = getAppSwitchOption(activeApp);

  const openMenu = useCallback(() => {
    void prefetchWorkspaceTabs(queryClient);
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuDismissInstant(false);
      setMenuOpen(true);
    });
  }, [queryClient]);

  const closeMenu = useCallback(() => {
    setMenuDismissInstant(false);
    setMenuOpen(false);
  }, []);

  const handleSelect = useCallback(
    (key: AppSwitchKey) => {
      if (key !== activeApp) {
        switchTab(key);
      }
      setMenuDismissInstant(true);
      setMenuOpen(false);
      onNavigate?.();
    },
    [activeApp, onNavigate, switchTab],
  );

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          onPress={openMenu}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${active.label}. Switch app`}
          accessibilityHint="Opens app switcher"
        >
          <Feather
            name={active.icon}
            size={LAYOUT_ICON.context}
            color={theme.colors.mutedForeground}
          />
          <Text style={styles.label} numberOfLines={1}>
            {active.label}
          </Text>
          <Feather
            name="chevron-down"
            size={14}
            color={theme.colors.mutedForeground}
          />
        </Pressable>
      </View>

      <AppSwitchMenu
        visible={menuOpen}
        dismissInstant={menuDismissInstant}
        activeApp={activeApp}
        anchor={menuAnchor}
        onDismiss={closeMenu}
        onSelect={handleSelect}
      />
    </>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    button: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["1"],
      minHeight: 32,
      paddingHorizontal: theme.spacing["2"],
      borderRadius: theme.borderRadius.lg,
    },
    pressed: {
      opacity: 0.65,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    label: {
      ...layoutTitleStyle(theme, "lg"),
      flexShrink: 1,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
