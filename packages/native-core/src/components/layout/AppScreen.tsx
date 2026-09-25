import React, { useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { layoutBody, layoutScreen } from "../../lib/app-layout";

interface AppScreenProps {
  children: React.ReactNode;
  /** Top chrome (toolbar, navigation header, selection bar shell). */
  header?: React.ReactNode;
  /** Fixed footer (mail bulk bar is often absolutely positioned instead). */
  footer?: React.ReactNode;
  /** Content below header; receives flex:1. */
  edges?: Edge[];
}

/**
 * Standard full-screen shell: safe area + optional header/footer + flex body.
 * Use on every route instead of ad-hoc SafeAreaView wrappers.
 */
export function AppScreen({
  children,
  header,
  footer,
  edges = ["top"],
}: AppScreenProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {header}
      <View style={styles.body}>{children}</View>
      {footer}
    </SafeAreaView>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    screen: layoutScreen(theme),
    body: layoutBody(),
  });
}
