import React from "react";
import { Feather } from "@expo/vector-icons";
import { NavigationHeader } from "../layout";

interface MailReaderHeaderProps {
  title: string;
  mailboxName?: string;
  mailboxIcon?: keyof typeof Feather.glyphMap;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

/** @see NavigationHeader */
export function MailReaderHeader({
  title,
  mailboxName,
  mailboxIcon = "mail",
  onBack,
  rightAction,
}: MailReaderHeaderProps) {
  return (
    <NavigationHeader
      variant="reader"
      title={title}
      subtitle={mailboxName}
      subtitleIcon={mailboxName ? mailboxIcon : undefined}
      onBack={onBack}
      trailing={rightAction}
    />
  );
}
