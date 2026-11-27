import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useMailCompose } from "../../providers/MailComposeProvider";
import { BottomSheet, BottomSheetHeader } from "@workspace/native-core/components/BottomSheet";
import { SheetRow } from "@workspace/native-core/components/sheet/SheetRow";
import { BlobatarAvatar } from "@workspace/native-core/components/BlobatarAvatar";
import { MailSheetList } from "./MailSheetList";
import { MailSheetPanel } from "./MailSheetPanel";
import { MAIL_LAYOUT, mailSpacing } from "@workspace/native-core/components/mail/mail-ui";

export type RecipientAddress = {
  email: string;
  name?: string | null;
};

type RecipientSheetProps = {
  recipient: RecipientAddress;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Copy a person's address or start a message to them; `onDone` closes whatever surface offered the action. */
export function useRecipientActions(recipient: RecipientAddress, onDone: () => void) {
  const { toast } = useToast();
  const { openCompose } = useMailCompose();
  const name = recipient.name?.trim() || undefined;
  return {
    copy: () => {
      Clipboard.setStringAsync(recipient.email).then(
        () => {
          toast("Copied");
          onDone();
        },
        () => toast("Could not copy email", "error"),
      );
    },
    compose: () => {
      onDone();
      openCompose({ to: recipient.email, toName: name });
    },
  };
}

export function RecipientSheet({
  recipient,
  children,
  style,
}: RecipientSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);
  const [open, setOpen] = React.useState(false);
  const actions = useRecipientActions(recipient, () => setOpen(false));

  const displayName = recipient.name?.trim() || recipient.email;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={style}
        accessibilityRole="button"
        accessibilityLabel={`View details for ${displayName}`}
      >
        {children}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <BottomSheet
            visible={open}
            onDismiss={() => setOpen(false)}
            snapPoints={[0.4]}
          >
            <BottomSheetHeader>
              <View style={styles.header}>
                <BlobatarAvatar
                  email={recipient.email}
                  name={recipient.name}
                  size={MAIL_LAYOUT.avatarSize}
                />
                <View style={styles.headerText}>
                  <Text style={styles.name} numberOfLines={2}>
                    {displayName}
                  </Text>
                  <Text style={styles.email} numberOfLines={2}>
                    {recipient.email}
                  </Text>
                </View>
              </View>
            </BottomSheetHeader>
            <MailSheetPanel bottomInset={insets.bottom}>
              <MailSheetList>
                <SheetRow
                  variant="mail"
                  icon="copy"
                  label="Copy email"
                  onPress={actions.copy}
                />
                <SheetRow
                  variant="mail"
                  icon="send"
                  label="New message"
                  onPress={actions.compose}
                  showDivider
                />
              </MailSheetList>
            </MailSheetPanel>
          </BottomSheet>
        </View>
      </Modal>
    </>
  );
}

function createStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);

  const view = {
    modalRoot: {
      flex: 1,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.rowGap,
    },
    headerText: {
      flex: 1,
      gap: theme.spacing["0.5"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    name: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    email: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
