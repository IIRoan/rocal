import React, { useMemo } from "react";
import { Alert, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import {
  formatAuthResultsSummary,
  parseAuthResults,
} from "../../lib/mail/auth-results";

type MailAuthResultsBadgeProps = {
  authResultsHeaders?: unknown;
};

export function MailAuthResultsBadge({
  authResultsHeaders,
}: MailAuthResultsBadgeProps) {
  const { theme } = useTheme();
  const results = useMemo(
    () => parseAuthResults(authResultsHeaders),
    [authResultsHeaders],
  );

  if (
    results.spf === "none" &&
    results.dkim === "none" &&
    results.dmarc === "none"
  ) {
    return null;
  }

  const allPass = results.spf === "pass" && results.dkim === "pass";
  const anyFail =
    results.spf === "fail" ||
    results.dkim === "fail" ||
    results.dmarc === "fail";
  const icon = allPass ? "shield" : anyFail ? "alert-octagon" : "shield";
  const color = allPass
    ? ((theme.colors as unknown as Record<string, string>)["success"] ??
      theme.colors.primaryBase)
    : anyFail
      ? theme.colors.destructive
      : theme.colors.mutedForeground;
  const summary = formatAuthResultsSummary(results);

  return (
    <Pressable
      onPress={() =>
        Alert.alert(
          "Authentication",
          summary.length > 0 ? summary.join("\n") : "No authentication data",
        )
      }
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Authentication results"
    >
      <Feather name={icon} size={13} color={color} />
    </Pressable>
  );
}
