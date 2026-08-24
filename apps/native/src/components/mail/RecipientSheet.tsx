import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  enrichSelfMailRecipient,
  isCurrentUserMailAddress,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { BottomSheet, BottomSheetHeader } from "../BottomSheet";
import { BlobatarAvatar } from "../BlobatarAvatar";
import { mailSpacing } from "./mail-ui";

export type RecipientAddress = {
  email: string;
  name?: string | null;
};

type RecipientSheetProps = {
  recipient: RecipientAddress;
  children: React.ReactNode;
};

export function RecipientSheet({
  recipient,
  children,
}: RecipientSheetProps) {
  const { theme } = useTheme();
  const { toast } = useToast();
  const router = useRouter();
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
        accessibilityRole="button"
        accessibilityLabel={`View details for ${displayName}`}
      >
        {children}
      </Pressable>

      <BottomSheet visible={open} onDismiss={() => setOpen(false)} snapPoints={[0.4]}>
        <BottomSheetHeader>
          <View style={styles.header}>
            <BlobatarAvatar
              email={recipient.email}
              name={recipient.name}
              size={40}
            />
            <View style={styles.headerText}>
              <Text style={styles.name}>{displayName}</Text>
              {displayName !== recipient.email ? (
                <Text style={styles.email} numberOfLines={2}>
                  {recipient.email}
                </Text>
              ) : null}
            </View>
          </View>
        </BottomSheetHeader>

        <View style={styles.actions}>
          <Pressable
            onPress={() => void handleCopy()}
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Feather
              name="copy"
              size={16}
              color={theme.colors.mutedForeground}
            />
            <Text style={styles.actionText}>Copy</Text>
          </Pressable>
          <Pressable
            onPress={handleEmail}
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Feather
              name="send"
              size={16}
              color={theme.colors.mutedForeground}
            />
            <Text style={styles.actionText}>Email</Text>
          </Pressable>
        </View>
      </BottomSheet>
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
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.rowGap,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.secondary,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    headerText: {
      flex: 1,
      gap: theme.spacing["0.5"],
    },
    actions: {
      flexDirection: "row" as const,
      gap: pad.chipGap,
      paddingHorizontal: pad.rowH,
      paddingBottom: pad.rowH,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      paddingTop: pad.section,
    },
    actionButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight,
      paddingHorizontal: pad.section,
      paddingVertical: pad.section,
      borderRadius: theme.borderRadius.md,
    },
    actionButtonPressed: {
      backgroundColor: theme.colors.muted,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    avatarText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.secondaryForeground,
    },
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
    actionText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
