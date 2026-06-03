import { StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SheetListProps {
  children: React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SheetList({ children }: SheetListProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return <View style={styles.container}>{children}</View>;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      marginHorizontal: 16,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.muted + "22",
      overflow: "hidden",
    } as ViewStyle,
  });
}
