import React, { useMemo, useState } from "react";
import { Alert, Share, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import * as Clipboard from "expo-clipboard";
import { getErrorMessage } from "@workspace/calendar-core";
import { RECOVERY_KIT_NOTICE } from "@workspace/calendar-core/product-info";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useRecoveryKit } from "../../../hooks/use-recovery-kit";
import { useTheme } from "../../../providers/ThemeProvider";
import { useToast } from "../../../providers/ToastProvider";
import {
  SheetButton,
  SheetGroup,
  SheetMessage,
  SheetSection,
  SheetTextField,
} from "../../sheet/SheetSections";

/** Creates a recovery kit behind the current password and shows its key once; the key is never written anywhere. */
export function RecoveryKitPage({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { toast } = useToast();
  const { statusQuery, createMutation, deleteMutation } = useRecoveryKit();
  const [password, setPassword] = useState("");
  const recoveryKey = createMutation.data;
  const exists = statusQuery.data?.exists === true;

  const close = () => {
    createMutation.reset();
    onClose();
  };

  const create = () => {
    if (!password) return;
    createMutation.mutate(password, { onSuccess: () => setPassword("") });
  };

  const remove = () => {
    Alert.alert(
      "Remove recovery kit?",
      "Without a recovery kit, a forgotten password can only be handled by support.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            deleteMutation.mutate(undefined, {
              onSuccess: () => {
                toast("Recovery kit removed");
                onClose();
              },
              onError: (error) =>
                toast(getErrorMessage(error, "Failed to remove the recovery kit"), "error"),
            }),
        },
      ],
    );
  };

  if (recoveryKey) {
    return (
      <View style={styles.form}>
        <SheetSection title="Your recovery key" footer={RECOVERY_KIT_NOTICE}>
          <SheetGroup>
            <Text style={styles.key} selectable accessibilityLabel={`Recovery key ${recoveryKey}`}>
              {recoveryKey}
            </Text>
          </SheetGroup>
        </SheetSection>
        <View style={styles.actions}>
          <SheetButton
            label="Copy"
            icon="copy"
            variant="secondary"
            onPress={() => {
              Clipboard.setStringAsync(recoveryKey)
                .then(() => toast("Recovery key copied"))
                .catch(() => toast("Could not copy the recovery key", "error"));
            }}
          />
          <SheetButton
            label="Share"
            icon="share"
            variant="secondary"
            onPress={() => {
              Share.share({ message: `Solace recovery key: ${recoveryKey}` }).catch(() => undefined);
            }}
          />
          <SheetButton label="I saved it" onPress={close} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <SheetSection
        title={exists ? "Replace recovery kit" : "Create recovery kit"}
        footer={
          exists
            ? "A new kit replaces the old one, which stops working. Enter your password to continue."
            : "A recovery kit resets a forgotten password and keeps your encrypted data. Enter your password to continue."
        }
      >
        <SheetGroup>
          <SheetTextField
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            placeholder="Current password"
            accessibilityLabel="Current password"
          />
        </SheetGroup>
        {createMutation.error ? (
          <SheetMessage
            tone="destructive"
            text={getErrorMessage(createMutation.error, "Failed to create the recovery kit")}
          />
        ) : null}
      </SheetSection>
      <View style={styles.actions}>
        <SheetButton
          label={exists ? "Create new kit" : "Create kit"}
          onPress={create}
          pending={createMutation.isPending}
          disabled={!password}
        />
        {exists ? (
          <SheetButton
            label="Remove kit"
            variant="destructive"
            onPress={remove}
            pending={deleteMutation.isPending}
          />
        ) : null}
        <SheetButton label="Cancel" variant="secondary" onPress={close} />
      </View>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    form: { gap: theme.spacing["3"] },
    actions: { gap: theme.spacing["2"] },
  } satisfies Record<string, ViewStyle>;
  const text = {
    key: {
      fontFamily: theme.typography.fontFamily.mono,
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
      padding: theme.spacing["3"],
      textAlign: "center" as const,
    },
  } satisfies Record<string, TextStyle>;
  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
