import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { sheetBottomPadding } from "@workspace/native-core/components/sheet/sheet-padding";
import { MAIL_LAYOUT, mailSpacing } from "@workspace/native-core/components/mail/mail-ui";

interface MailSheetPanelProps {
  bottomInset: number;
  children: React.ReactNode;
}

/** Consistent horizontal padding and gap for mail action sheets. */
export function MailSheetPanel({ bottomInset, children }: MailSheetPanelProps) {
  const { theme } = useTheme();
  const pad = mailSpacing(theme);

  return (
    <View
      style={[
        styles.panel,
        {
          paddingHorizontal: pad.sheetH,
          paddingBottom: sheetBottomPadding(bottomInset),
          gap: MAIL_LAYOUT.sheetSectionGap,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexGrow: 1,
  } as ViewStyle,
});
