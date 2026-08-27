import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  getContactDisplayLabel,
  type RecentContactEntry,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { BlobatarAvatar } from "../BlobatarAvatar";
import { LAYOUT_METRICS } from "../../lib/app-layout";
import { mailSpacing, mailTypography } from "./mail-ui";

export type RecipientSuggestionListProps = {
  rows: RecentContactEntry[];
  query: string;
  isAvailable: boolean;
  isLoading: boolean;
  onSelect: (entry: RecentContactEntry) => void;
};

export function RecipientSuggestionList({
  rows,
  query,
  isAvailable,
  isLoading,
  onSelect,
}: RecipientSuggestionListProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const trimmedQuery = query.trim();

  if (!isAvailable) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Unlock your vault to see recent contacts.
        </Text>
      </View>
    );
  }

  if (rows.length === 0 && isLoading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {trimmedQuery ? "No matching contacts" : "No recent contacts yet"}
        </Text>
      </View>
    );
  }

  const heading = trimmedQuery ? "Matching contacts" : "Recent contacts";

  return (
    <View style={styles.list}>
      <Text style={styles.heading}>{heading}</Text>
      {rows.map((item) => {
        const label = getContactDisplayLabel(item);
        return (
          <Pressable
            key={item.email}
            onPressIn={() => onSelect(item)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <BlobatarAvatar
              email={item.email}
              name={item.displayName}
              size={32}
            />
            <View style={styles.meta}>
              <Text style={styles.name} numberOfLines={1}>
                {label}
              </Text>
              {item.displayName ? (
                <Text style={styles.email} numberOfLines={1}>
                  {item.email}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const spacing = mailSpacing(theme);
  const type = mailTypography(theme);

  const view = {
    list: {
      width: "100%" as const,
    },
    empty: {
      minHeight: LAYOUT_METRICS.hitSize,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: spacing.rowH,
      paddingVertical: theme.spacing["3"],
    },
    row: {
      minHeight: LAYOUT_METRICS.hitSize,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      paddingHorizontal: spacing.rowH,
      paddingVertical: theme.spacing["2"],
    },
    rowPressed: {
      backgroundColor: theme.colors.muted,
    },
    meta: {
      flex: 1,
      minWidth: 0,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    heading: {
      ...type.overline,
      paddingHorizontal: spacing.rowH,
      paddingTop: theme.spacing["3"],
      paddingBottom: theme.spacing["1"],
    },
    emptyText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
      textAlign: "center" as const,
    },
    name: {
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
    },
    email: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
