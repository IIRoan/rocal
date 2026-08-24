import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  formatRecentContactForField,
  insertRecipientSuggestion,
  parseAddressList,
  type RecentContactEntry,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useRecentContacts } from "../../hooks/use-recent-contacts";
import { BlobatarAvatar } from "../BlobatarAvatar";

function getActiveRecipientToken(value: string): string {
  const separatorIndex = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
  return separatorIndex >= 0
    ? value.slice(separatorIndex + 1).trim()
    : value.trim();
}

export type RecipientSuggestInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  mode?: "mail" | "calendar";
  onSelectSuggestion?: (entry: RecentContactEntry) => void;
  onSubmitEditing?: () => void;
  style?: TextStyle | TextStyle[];
  containerStyle?: ViewStyle | ViewStyle[];
  autoFocus?: boolean;
  hasError?: boolean;
};

export function RecipientSuggestInput({
  value,
  onChangeText,
  placeholder,
  mode = "mail",
  onSelectSuggestion,
  onSubmitEditing,
  style,
  containerStyle,
  autoFocus,
  hasError,
}: RecipientSuggestInputProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const activeToken = getActiveRecipientToken(value);
  const excludeEmails = useMemo(
    () => parseAddressList(value).map((address) => address.email),
    [value],
  );

  const { suggestions, isAvailable } = useRecentContacts({
    query: activeToken,
    excludeEmails,
    limit: 8,
  });

  const showSuggestions = open && isAvailable && suggestions.length > 0;

  const selectSuggestion = useCallback(
    (entry: RecentContactEntry) => {
      if (onSelectSuggestion) {
        onSelectSuggestion(entry);
        setOpen(false);
        return;
      }

      const formatted = formatRecentContactForField(entry);
      const nextValue =
        mode === "mail"
          ? insertRecipientSuggestion(value, formatted, {
              appendSeparator: true,
            })
          : formatted;

      onChangeText(nextValue);
      setOpen(false);
    },
    [mode, onChangeText, onSelectSuggestion, value],
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        style={[
          styles.input,
          hasError ? styles.inputError : undefined,
          style,
        ]}
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120);
        }}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedForeground}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="done"
        onSubmitEditing={onSubmitEditing}
      />

      {showSuggestions ? (
        <View style={styles.suggestions}>
          {suggestions.map((entry) => {
            const label = entry.displayName?.trim() || entry.email;
            return (
              <Pressable
                key={entry.email}
                style={styles.suggestionRow}
                onPress={() => selectSuggestion(entry)}
              >
                <BlobatarAvatar
                  email={entry.email}
                  name={entry.displayName}
                  size={28}
                />
                <View style={styles.suggestionMeta}>
                  <Text style={styles.suggestionName} numberOfLines={1}>
                    {label}
                  </Text>
                  {entry.displayName ? (
                    <Text style={styles.suggestionEmail} numberOfLines={1}>
                      {entry.email}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      minWidth: 0,
    },
    suggestions: {
      marginTop: theme.spacing["1"],
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      overflow: "hidden" as const,
      backgroundColor: theme.colors.card,
    },
    suggestionRow: {
      minHeight: 44,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    suggestionAvatar: {
      width: 28,
      height: 28,
      borderRadius: theme.borderRadius.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: theme.colors.muted,
    },
    suggestionMeta: {
      flex: 1,
      minWidth: 0,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    input: {
      flex: 1,
      minWidth: 0,
      paddingVertical: theme.spacing["1"],
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
    inputError: {
      color: theme.colors.destructive,
    },
    suggestionAvatarText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    suggestionName: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    suggestionEmail: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...view, ...text };
}
