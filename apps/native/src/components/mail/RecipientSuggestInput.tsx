import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  ScrollView,
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

const SUGGESTION_LIST_MAX_HEIGHT = 280;
const BLUR_CLOSE_MS = 200;
const SUPPRESS_REOPEN_MS = 400;

function getActiveRecipientToken(value: string): string {
  const separatorIndex = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
  return separatorIndex >= 0
    ? value.slice(separatorIndex + 1).trim()
    : value.trim();
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

export type RecipientSuggestInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  mode?: "mail" | "calendar";
  onSelectSuggestion?: (entry: RecentContactEntry) => void;
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  /** Fired when the suggestion panel opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** When false, force-closes the suggestion panel (e.g. another field focused). */
  open?: boolean;
  style?: TextStyle | TextStyle[];
  containerStyle?: ViewStyle | ViewStyle[];
  /** Renders beside the text field; suggestions always sit full-width below. */
  trailing?: ReactNode;
  inputRef?: Ref<TextInput>;
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
  onFocus,
  onOpenChange,
  open: openProp,
  style,
  containerStyle,
  trailing,
  inputRef,
  autoFocus,
  hasError,
}: RecipientSuggestInputProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fieldRef = useRef<TextInput | null>(null);
  const selectingRef = useRef(false);
  const listInteractionRef = useRef(false);
  const suppressOpenRef = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearBlurTimer(), [clearBlurTimer]);

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

  const closeSuggestions = useCallback(() => {
    suppressOpenRef.current = true;
    selectingRef.current = true;
    listInteractionRef.current = false;
    clearBlurTimer();
    setOpen(false);
    fieldRef.current?.blur();
    setTimeout(() => {
      suppressOpenRef.current = false;
      selectingRef.current = false;
    }, SUPPRESS_REOPEN_MS);
  }, [clearBlurTimer, setOpen]);

  const selectSuggestion = useCallback(
    (entry: RecentContactEntry) => {
      if (onSelectSuggestion) {
        onSelectSuggestion(entry);
      } else {
        const formatted = formatRecentContactForField(entry);
        const nextValue =
          mode === "mail"
            ? insertRecipientSuggestion(value, formatted, {
                appendSeparator: true,
              })
            : formatted;
        onChangeText(nextValue);
      }
      closeSuggestions();
    },
    [closeSuggestions, mode, onChangeText, onSelectSuggestion, value],
  );

  const markListInteraction = useCallback(() => {
    if (suppressOpenRef.current || selectingRef.current) {
      return;
    }
    // Keep the panel from closing on blur while the user scrolls/taps the
    // list — do not reopen here, or a tap-to-select races setOpen(true).
    listInteractionRef.current = true;
    clearBlurTimer();
  }, [clearBlurTimer]);

  const releaseListInteraction = useCallback(() => {
    requestAnimationFrame(() => {
      listInteractionRef.current = false;
    });
  }, []);

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.inputRow}>
        <TextInput
          ref={(node) => {
            fieldRef.current = node;
            assignRef(inputRef, node);
          }}
          style={[
            styles.input,
            hasError ? styles.inputError : undefined,
            style,
          ]}
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            if (!suppressOpenRef.current) {
              setOpen(true);
            }
          }}
          onFocus={() => {
            if (suppressOpenRef.current) {
              return;
            }
            clearBlurTimer();
            setOpen(true);
            onFocus?.();
          }}
          onBlur={() => {
            if (selectingRef.current || listInteractionRef.current) {
              return;
            }
            clearBlurTimer();
            blurTimerRef.current = setTimeout(() => {
              blurTimerRef.current = null;
              if (selectingRef.current || listInteractionRef.current) {
                return;
              }
              setOpen(false);
            }, BLUR_CLOSE_MS);
          }}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            closeSuggestions();
            onSubmitEditing?.();
          }}
        />
        {trailing}
      </View>

      {showSuggestions ? (
        <ScrollView
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          nestedScrollEnabled
          removeClippedSubviews={false}
          style={styles.suggestionScroll}
          onTouchStart={markListInteraction}
          onScrollBeginDrag={markListInteraction}
          onScrollEndDrag={releaseListInteraction}
          onMomentumScrollEnd={releaseListInteraction}
          onTouchEnd={releaseListInteraction}
        >
          <RecipientSuggestionList
            rows={suggestions}
            query={activeToken}
            isAvailable={isAvailable}
            isLoading={isLoading}
            onSelect={selectSuggestion}
          />
        </ScrollView>
      ) : null}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      width: "100%" as const,
      gap: theme.spacing["1"],
    },
    inputRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      width: "100%" as const,
    },
    suggestionScroll: {
      width: "100%" as const,
      maxHeight: SUGGESTION_LIST_MAX_HEIGHT,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
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
