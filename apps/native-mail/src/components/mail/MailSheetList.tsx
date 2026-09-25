import { StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { mailColors } from "@workspace/native-core/components/mail/mail-ui";

interface MailSheetListProps {
  children: React.ReactNode;
}

/** Grouped list surface for mail bottom sheets (matches screen horizontal rhythm). */
export function MailSheetList({ children }: MailSheetListProps) {
  const { theme } = useTheme();
  const colors = mailColors(theme);

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius: theme.borderRadius.lg,
          backgroundColor: colors.surfaceMuted,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  } as ViewStyle,
});
