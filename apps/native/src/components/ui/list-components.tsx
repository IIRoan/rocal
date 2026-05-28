/**
 * Shared list-screen primitives used by calendar-manage, subscription, and similar
 * screens that render titled sections with counts and empty-state cards.
 */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";

// ─── SectionHeader ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  count: number;
  /** Optional action button label shown on the right. */
  actionLabel?: string;
  onAction?: () => void;
  theme: ThemeTokens;
}

export function SectionHeader({
  title,
  count,
  actionLabel,
  onAction,
  theme,
}: SectionHeaderProps) {
  const styles = useMemo(() => createSectionHeaderStyles(theme), [theme]);

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleWrap}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createSectionHeaderStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: theme.spacing["1"],
    },
    sectionTitleWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
    },
    sectionTitle: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: "600",
      color: theme.colors.foreground,
    },
    sectionCount: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
      backgroundColor: theme.colors.muted,
      paddingHorizontal: theme.spacing["1"],
      borderRadius: theme.borderRadius.sm,
    },
    sectionAction: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.primaryBase,
      fontWeight: "500",
    },
  });
}

// ─── EmptyCard ────────────────────────────────────────────────────────────────

interface EmptyCardProps {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  text: string;
  theme: ThemeTokens;
}

export function EmptyCard({ icon, title, text, theme }: EmptyCardProps) {
  const styles = useMemo(() => createEmptyCardStyles(theme), [theme]);

  return (
    <View style={styles.emptyCard}>
      <Feather name={icon} size={18} color={theme.colors.mutedForeground} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function createEmptyCardStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    emptyCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.card,
      padding: theme.spacing["4"],
      alignItems: "center",
      gap: theme.spacing["2"],
    },
    emptyTitle: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: "600",
      color: theme.colors.foreground,
    },
    emptyText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
      textAlign: "center",
    },
  });
}
