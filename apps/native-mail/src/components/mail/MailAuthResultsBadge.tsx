import React, { useMemo } from "react";
import { Alert, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  formatAuthResultsSummary,
  getTrustedAuthResultsHeader,
  hasAuthResults,
  parseAuthResults,
  resolveAuthBadgeTone,
  type MailAuthResultsFields,
} from "@workspace/calendar-core";

type MailAuthResultsBadgeProps = {
  message: MailAuthResultsFields;
  simpleLoginForward?: boolean;
};

export function MailAuthResultsBadge({
  message,
  simpleLoginForward = false,
}: MailAuthResultsBadgeProps) {
  const { theme } = useTheme();
  const trustedHeader = getTrustedAuthResultsHeader(message);
  const results = useMemo(() => parseAuthResults(trustedHeader), [trustedHeader]);

  if (!hasAuthResults(results)) {
    return null;
  }

  const tone = resolveAuthBadgeTone(results);
  const icon = tone === "fail" ? "alert-octagon" : "shield";
  const color =
    tone === "pass"
      ? ((theme.colors as unknown as Record<string, string>)["success"] ??
        theme.colors.primaryBase)
      : tone === "fail"
        ? theme.colors.destructive
        : theme.colors.mutedForeground;
  const summary = formatAuthResultsSummary(results, { simpleLoginForward });

  return (
    <Pressable
      onPress={() => Alert.alert("Authentication", summary.join("\n"))}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Authentication results"
    >
      <Feather name={icon} size={13} color={color} />
    </Pressable>
  );
}
