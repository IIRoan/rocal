import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { mailSpacing, useMailSkin, type MailSkin } from "./mail-ui";

export interface MailTopToolbarProps {
  mailboxName: string;
  unreadCount: number;
  filterActive: boolean;
  onCompose: () => void;
  onOpenMailboxes: () => void;
  onOpenFilter: () => void;
  onOpenAccount: () => void;
  onSearch?: () => void;
}

/** Mail header: mailbox title that opens the drawer, compose/filter/settings actions, and search field. */
export function MailTopToolbar({
  mailboxName,
  unreadCount,
  filterActive,
  onCompose,
  onOpenMailboxes,
  onOpenFilter,
  onOpenAccount,
  onSearch,
}: MailTopToolbarProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);

  return (
    <View style={styles.shell}>
      <View style={styles.actionsRow}>
        <Pressable
          onPress={onOpenMailboxes}
          style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${mailboxName}${unreadCount > 0 ? `, ${unreadCount} unread` : ""}. Switch mailbox`}
        >
          <Text style={styles.title} numberOfLines={1}>
            {mailboxName}
            {unreadCount > 0 ? (
              <Text style={styles.count}>{` ${unreadCount > 999 ? "999+" : unreadCount}`}</Text>
            ) : null}
          </Text>
          <Feather name="chevron-down" size={22} color={skin.textSecondary} />
        </Pressable>
        <View style={styles.iconGroup}>
          <IconButton
            styles={styles}
            name="edit"
            color={skin.textSecondary}
            label="Compose message"
            onPress={onCompose}
          />
          <IconButton
            styles={styles}
            name="filter"
            color={filterActive ? skin.accent : skin.textSecondary}
            label={filterActive ? "Filter messages, filter on" : "Filter messages"}
            onPress={onOpenFilter}
          />
          <IconButton
            styles={styles}
            name="settings"
            color={skin.textSecondary}
            label="Settings"
            onPress={onOpenAccount}
          />
        </View>
      </View>

      {onSearch ? (
        <Pressable
          onPress={onSearch}
          style={({ pressed }) => [styles.search, pressed && styles.searchPressed]}
          accessibilityRole="search"
          accessibilityLabel="Search messages"
        >
          <Feather name="search" size={16} color={skin.textTertiary} />
          <Text style={styles.searchPlaceholder}>Search messages…</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function IconButton({
  styles,
  name,
  color,
  label,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  name: keyof typeof Feather.glyphMap;
  color: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name={name} size={20} color={color} />
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const pad = mailSpacing(theme);
  const view = {
    shell: {
      paddingHorizontal: pad.rowH,
      paddingBottom: theme.spacing["2"],
      backgroundColor: theme.colors.background,
    },
    actionsRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: theme.spacing["2"],
      minHeight: 44,
    },
    iconGroup: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginRight: -10,
    },
    iconButton: {
      width: 44,
      height: 44,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    pressed: {
      opacity: 0.6,
    },
    titleButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      flexShrink: 1,
      gap: 6,
      minHeight: 44,
    },
    search: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      height: 40,
      marginTop: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.lg,
      backgroundColor: skin.field,
    },
    searchPressed: {
      backgroundColor: skin.selected,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    title: {
      ...skin.largeTitle,
      flexShrink: 1,
    },
    count: {
      color: skin.textTertiary,
      fontWeight: "500" as TextStyle["fontWeight"],
    },
    searchPlaceholder: {
      fontSize: 15,
      lineHeight: 20,
      color: skin.textTertiary,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
