import React, { useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { layoutHeaderShell } from "../../lib/app-layout";

interface SurfaceToolbarProps {
  leading?: React.ReactNode;
  center?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Hairline border under the toolbar (default true). */
  bordered?: boolean;
  /** Tighter vertical padding when stacked with another header row. */
  dense?: boolean;
}

/**
 * Three-column header row for primary tab surfaces (calendar, mail list).
 * Leading/trailing slots are fixed width; center grows and centers content.
 */
export function SurfaceToolbar({
  leading,
  center,
  trailing,
  bordered = true,
  dense = false,
}: SurfaceToolbarProps) {
  const { theme } = useTheme();
  const styles = useMemo(
    () => createStyles(theme, bordered, dense),
    [theme, bordered, dense],
  );

  return (
    <View style={styles.shell}>
      <View style={styles.row}>
        <View style={styles.leading}>{leading}</View>
        <View style={styles.center}>{center}</View>
        <View style={styles.trailing}>{trailing}</View>
      </View>
    </View>
  );
}

function createStyles(theme: ThemeTokens, bordered: boolean, dense: boolean) {
  return StyleSheet.create({
    shell: {
      ...layoutHeaderShell(theme, { bordered }),
      paddingVertical: dense ? theme.spacing["1"] : theme.spacing["2"],
    } as ViewStyle,
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 32,
    } as ViewStyle,
    leading: {
      minWidth: 44,
      alignItems: "flex-start",
      justifyContent: "center",
    } as ViewStyle,
    center: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    trailing: {
      minWidth: 44,
      alignItems: "flex-end",
      justifyContent: "center",
    } as ViewStyle,
  });
}
