import { useEffect, useMemo } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useSheet } from "../../src/providers/SheetProvider";
import { CALENDAR_TAB_ROUTE } from "../../src/lib/navigation-routes";

/**
 * Event detail screen — used for deep links (e.g. `solace://event/{id}`).
 * Opens the EventSheet in view mode immediately via the root-level provider
 * and lands the user on the calendar so the sheet sits on the right surface.
 */
export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { openEventSheet } = useSheet();

  useEffect(() => {
    if (id) {
      openEventSheet({ type: "view", eventId: id });
      router.replace(CALENDAR_TAB_ROUTE as never);
    }
  }, [id, openEventSheet, router]);

  return <SafeAreaView style={styles.container} />;
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
  } satisfies Record<string, ViewStyle>;

  return StyleSheet.create(view);
}
