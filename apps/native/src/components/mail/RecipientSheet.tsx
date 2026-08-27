import React, { useMemo } from "react";
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
import { useRouter } from "expo-router";
import {
  enrichSelfMailRecipient,
  isCurrentUserMailAddress,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { BottomSheet, BottomSheetHeader } from "../BottomSheet";
import { SheetRow } from "../sheet/SheetRow";
import { BlobatarAvatar } from "../BlobatarAvatar";
import { MailSheetList } from "./MailSheetList";
import { MailSheetPanel } from "./MailSheetPanel";
import { MAIL_LAYOUT, mailSpacing } from "./mail-ui";

export type RecipientAddress = {
  email: string;
  name?: string | null;
};

type RecipientSheetProps = {
  recipient: RecipientAddress;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function RecipientSheet({
  recipient,
  children,
  style,
}: RecipientSheetProps) {
  const { theme } = useTheme();
  const { toast } = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = React.useState(false);

  const displayName = recipient.name?.trim() || recipient.email;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(recipient.email);
    toast("Copied");
    setOpen(false);
  };

  const handleEmail = () => {
    setOpen(false);
    const query = new URLSearchParams({ to: recipient.email });
    const name = recipient.name?.trim();
    if (name) {
      query.set("toName", name);
    }
    router.push(`/(tabs)/mail/compose?${query.toString()}` as never);
  };

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
                  onPress={() => void handleCopy()}
                />
                <SheetRow
                  variant="mail"
                  icon="send"
                  label="New message"
                  onPress={handleEmail}
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

export function RecipientLinkList({
  recipients,
  currentUserEmail,
  currentUserName,
  textStyle,
}: {
  recipients: RecipientAddress[];
  currentUserEmail?: string;
  currentUserName?: string | null;
  textStyle?: TextStyle;
}) {
  return (
    <Text style={textStyle}>
      {recipients.map((recipient, index) => (
        <Text key={`${recipient.email}-${index}`}>
          {index > 0 ? ", " : ""}
          <RecipientLink
            recipient={recipient}
            currentUserEmail={currentUserEmail}
            currentUserName={currentUserName}
            textStyle={textStyle}
          />
        </Text>
      ))}
    </Text>
  );
}

export function RecipientLink({
  recipient,
  currentUserEmail,
  currentUserName,
  textStyle,
  showInlineAddress = false,
}: {
  recipient: RecipientAddress;
  currentUserEmail?: string;
  currentUserName?: string | null;
  textStyle?: TextStyle;
  showInlineAddress?: boolean;
}) {
  const enriched = enrichSelfMailRecipient(recipient, {
    email: currentUserEmail,
    name: currentUserName,
  });
  const displayName = enriched.name?.trim() || enriched.email;
  const isMe = isCurrentUserMailAddress(recipient.email, currentUserEmail);
  const showAddressSuffix =
    (showInlineAddress || isMe) &&
    Boolean(enriched.name?.trim()) &&
    displayName !== enriched.email;

  return (
    <RecipientSheet recipient={enriched}>
      <Text style={textStyle}>
        {showAddressSuffix ? (
          <>
            <Text style={textStyle}>{displayName}</Text>
            <Text style={[textStyle, stylesInlineEmail(textStyle)]}>
              {" "}
              &lt;{enriched.email}&gt;
            </Text>
          </>
        ) : (
          displayName
        )}
      </Text>
    </RecipientSheet>
  );
}

function stylesInlineEmail(base?: TextStyle): TextStyle {
  return {
    ...base,
    textDecorationLine: "none",
    opacity: 0.75,
  };
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
