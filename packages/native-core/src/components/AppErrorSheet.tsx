import { StyleSheet, Text, View } from "react-native";
import * as Updates from "expo-updates";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
} from "./BottomSheet";
import {
  SheetActions,
  SheetPrimaryButton,
  SheetSecondaryButton,
} from "./sheet/SheetActions";

function restartApp() {
  // reloadAsync rejects in Expo Go / Metro, where "Try again" is the way out.
  Updates.reloadAsync().catch(() => undefined);
}

/** Recovery drawer over the app background once a render error has taken the screens down. */
export function AppErrorSheet({ onRetry }: { onRetry: () => void }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.screen}>
      {/* Swiping the drawer away leaves nothing behind it, so dismissing retries too. */}
      <BottomSheet visible onDismiss={onRetry} snapPoints={[0.36]}>
        <BottomSheetHeader showClose={false}>
          <BottomSheetTitle>Something went wrong</BottomSheetTitle>
        </BottomSheetHeader>
        <BottomSheetBody>
          <Text style={styles.message}>
            This screen stopped working. Try again, or restart Solace if it
            keeps happening.
          </Text>
        </BottomSheetBody>
        <BottomSheetFooter>
          <SheetActions chrome={false}>
            {Updates.isEnabled ? (
              <SheetSecondaryButton label="Restart" onPress={restartApp} />
            ) : null}
            <SheetPrimaryButton
              label="Try again"
              icon="refresh-cw"
              onPress={onRetry}
            />
          </SheetActions>
        </BottomSheetFooter>
      </BottomSheet>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    message: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      paddingTop: theme.spacing["2"],
      paddingBottom: theme.spacing["4"],
    },
  });
}
