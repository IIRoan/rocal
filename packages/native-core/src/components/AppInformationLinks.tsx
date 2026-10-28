import { Pressable, StyleSheet, Text, View } from "react-native";
import { productLinks } from "@workspace/calendar-core/product-info";
import type { ThemeTokens } from "@workspace/design-tokens";
import { APP_BASE_URL } from "../lib/constants";
import { openExternalLink } from "../lib/open-external-link";
import { useTheme } from "../providers/ThemeProvider";

export function AppInformationLinks() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const links = productLinks(APP_BASE_URL);
  if (!links.privacy || !links.support) return null;
  return (
    <View style={styles.row}>
      {[
        { label: "Privacy policy", url: links.privacy },
        { label: "Support", url: links.support },
      ].map(({ label, url }) => (
        <Pressable
          key={label}
          accessibilityRole="link"
          accessibilityLabel={label}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          onPress={() => openExternalLink(url)}
        >
          <Text style={styles.text}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: theme.spacing["4"],
    },
    link: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
    },
    pressed: { backgroundColor: theme.colors.muted },
    text: {
      color: theme.colors.primaryBase,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
    },
  });
}
