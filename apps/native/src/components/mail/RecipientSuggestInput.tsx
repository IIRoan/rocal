import { useCallback, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
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
import { RecipientSuggestionList } from "./RecipientSuggestionList";

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
  const selectingRef = useRef(false);
  const [open, setOpen] = useState(false);

  const activeToken = getActiveRecipientToken(value);
  const excludeEmails = useMemo(
    () => parseAddressList(value).map((address) => address.email),
    [value],
  );

  const { suggestions, isAvailable, isLoading } = useRecentContacts({
    query: activeToken,
    excludeEmails,
    limit: activeToken.trim() ? 8 : 12,
  });

  const showSuggestions =
    open &&
    isAvailable &&
    (isLoading || suggestions.length > 0 || activeToken.trim().length > 0);

  const selectSuggestion = useCallback(
    (entry: RecentContactEntry) => {
      selectingRef.current = true;
      if (onSelectSuggestion) {
        onSelectSuggestion(entry);
        setOpen(false);
      } else {
        const formatted = formatRecentContactForField(entry);
        const nextValue =
          mode === "mail"
            ? insertRecipientSuggestion(value, formatted, {
                appendSeparator: true,
              })
            : formatted;
        onChangeText(nextValue);
        setOpen(false);
      }
      requestAnimationFrame(() => {
        selectingRef.current = false;
      });
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
          if (selectingRef.current) {
            return;
          }
          setTimeout(() => {
            if (!selectingRef.current) {
              setOpen(false);
            }
          }, 120);
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
          <RecipientSuggestionList
            rows={suggestions}
            query={activeToken}
            isAvailable={isAvailable}
            isLoading={isLoading}
            onSelect={selectSuggestion}
          />
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
  } satisfies Record<string, TextStyle>;

  return { ...view, ...text };
}
