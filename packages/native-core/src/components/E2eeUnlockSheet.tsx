import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useAuth } from "../providers/AuthProvider";
import { useE2ee } from "../providers/E2eeProvider";
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
import { SheetMessage, SheetTextField } from "./sheet/SheetSections";

const UNLOCK_FAILED_MESSAGE =
  "That password did not unlock your data. If you changed it recently, try the previous one.";
const UNLOCK_UNREACHABLE_MESSAGE =
  "Solace could not finish unlocking. Check your connection and try again.";

/** Asks for the encryption password when this device has no key and signing in did not open the account key. */
export function E2eeUnlockSheet({ onUnlocked }: { onUnlocked: () => void }) {
  const { needsPassword, unlockWithPassword } = useE2ee();
  const { signOut } = useAuth();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  // Swiping away would leave everything locked with no way back, so the drawer reopens.
  const [presentKey, setPresentKey] = useState(0);

  const handleUnlock = async () => {
    setIsPending(true);
    setError(null);
    const outcome = await unlockWithPassword(password).then(
      (unlocked) => (unlocked ? "unlocked" : "wrong-password"),
      () => "unreachable",
    );
    setIsPending(false);
    if (outcome !== "unlocked") {
      setError(
        outcome === "wrong-password"
          ? UNLOCK_FAILED_MESSAGE
          : UNLOCK_UNREACHABLE_MESSAGE,
      );
      return;
    }
    setPassword("");
    onUnlocked();
  };

  const submit = () => {
    if (!password || isPending) return;
    handleUnlock().catch(() => undefined);
  };

  return (
    <BottomSheet
      visible={needsPassword}
      presentKey={presentKey}
      onDismiss={() => setPresentKey((key) => key + 1)}
      snapPoints={[0.5]}
    >
      <BottomSheetHeader showClose={false}>
        <BottomSheetTitle>Unlock encrypted data</BottomSheetTitle>
      </BottomSheetHeader>
      <BottomSheetBody>
        <Text style={styles.message}>
          This device needs your password to open your encrypted events and
          mail. If you changed your password recently, enter the previous one.
        </Text>
        <View style={styles.field}>
          <SheetTextField
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            placeholder="Password"
            accessibilityLabel="Password"
          />
        </View>
        {error ? <SheetMessage text={error} tone="destructive" /> : null}
      </BottomSheetBody>
      <BottomSheetFooter>
        <SheetActions chrome={false}>
          <SheetSecondaryButton
            label="Sign out"
            onPress={() => {
              signOut().catch(() => undefined);
            }}
            disabled={isPending}
          />
          <SheetPrimaryButton
            label="Unlock"
            icon="unlock"
            onPress={submit}
            disabled={!password}
            loading={isPending}
          />
        </SheetActions>
      </BottomSheetFooter>
    </BottomSheet>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    message: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      paddingTop: theme.spacing["2"],
      paddingBottom: theme.spacing["4"],
    },
    field: {
      paddingBottom: theme.spacing["2"],
    },
  });
}
