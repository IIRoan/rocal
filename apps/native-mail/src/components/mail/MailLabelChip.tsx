import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";

interface MailLabelChipProps {
  name: string;
  color: string;
}

/** Outlined pill with a color dot, used for labels in the list and reader. */
export function MailLabelChip({ name, color }: MailLabelChipProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);

  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.label} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  return StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      maxWidth: 140,
      gap: 5,
      height: 22,
      paddingHorizontal: 8,
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: skin.borderPrimary,
      backgroundColor: skin.surface,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    label: {
      flexShrink: 1,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
      color: theme.colors.foreground,
    },
  });
}
