import React from "react";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { NavigationHeader } from "@workspace/native-core/components/layout/NavigationHeader";
import { HeaderIconButton } from "@workspace/native-core/components/layout/HeaderIconButton";

interface MailReaderHeaderProps {
  mailboxName?: string;
  mailboxIcon?: keyof typeof Feather.glyphMap;
  onBack?: () => void;
  onReply?: () => void;
  replyDisabled?: boolean;
  onMore?: () => void;
  moreDisabled?: boolean;
}

/** Borderless back + small mailbox name with trailing reply and actions menu; the subject lives in the message header. */
export function MailReaderHeader({
  mailboxName = "Mail",
  mailboxIcon = "mail",
  onBack,
  onReply,
  replyDisabled,
  onMore,
  moreDisabled,
}: MailReaderHeaderProps) {
  const router = useRouter();

  return (
    <NavigationHeader
      variant="reader"
      title={mailboxName}
      subtitleIcon={mailboxIcon}
      bordered={false}
      leading={
        <HeaderIconButton
          name="chevron-left"
          onPress={onBack ?? (() => router.back())}
          accessibilityLabel="Go back"
        />
      }
      trailing={
        onMore || onReply ? (
          <View style={styles.trailing}>
            {onReply ? (
              <HeaderIconButton
                name="corner-up-left"
                onPress={onReply}
                disabled={replyDisabled}
                accessibilityLabel="Reply"
              />
            ) : null}
            {onMore ? (
              <HeaderIconButton
                name="more-horizontal"
                onPress={onMore}
                disabled={moreDisabled}
                accessibilityLabel="Message actions"
              />
            ) : null}
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: "row", alignItems: "center" },
});
