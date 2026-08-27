import React from "react";
import { Feather } from "@expo/vector-icons";
import { NavigationHeader } from "../layout";

interface MailReaderHeaderProps {
  mailboxName?: string;
  mailboxIcon?: keyof typeof Feather.glyphMap;
  onBack?: () => void;
  trailing?: React.ReactNode;
}

/** Back + mailbox name, matching iOS Mail. Subject lives in the message header. */
export function MailReaderHeader({
  mailboxName = "Mail",
  mailboxIcon = "mail",
  onBack,
  trailing,
}: MailReaderHeaderProps) {
  return (
    <NavigationHeader
      variant="reader"
      title={mailboxName}
      subtitleIcon={mailboxIcon}
      onBack={onBack}
      trailing={trailing}
    />
  );
}
