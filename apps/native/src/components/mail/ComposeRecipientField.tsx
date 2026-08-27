import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  isValidEmailAddress,
  type ParsedMailAddress,
  type RecentContactEntry,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { LAYOUT_METRICS } from "../../lib/app-layout";
import { useRecentContacts } from "../../hooks/use-recent-contacts";
import { mailColors } from "./mail-ui";
import { RecipientSuggestionList } from "./RecipientSuggestionList";
import {
  addRecipientChip,
  consumeRecipientDraft,
  parseRecipientField,
  recipientChipLabel,
  removeRecipientChip,
  serializeRecipientField,
  shouldCommitDraftOnChange,
} from "../../lib/mail/compose-recipients";

const SUGGESTION_LIST_MAX_HEIGHT = 280;
const BLUR_CLOSE_MS = 120;
const EMPTY_EMAILS: string[] = [];

export type ComposeRecipientFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  trailing?: ReactNode;
  excludeEmails?: string[];
};

export function ComposeRecipientField({
  value,
  onChangeText,
  placeholder,
  trailing,
  excludeEmails = EMPTY_EMAILS,
}: ComposeRecipientFieldProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const inputRef = useRef<TextInput>(null);
  const selectingRef = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedRef = useRef(value);
  const initial = parseRecipientField(value);
  const [chips, setChips] = useState<ParsedMailAddress[]>(initial.chips);
  const [draft, setDraft] = useState(initial.draft);
  const [focused, setFocused] = useState(false);
  const chipsRef = useRef(chips);
  const draftRef = useRef(draft);

  useEffect(() => {
    chipsRef.current = chips;
    draftRef.current = draft;
  }, [chips, draft]);

  const excluded = useMemo(() => {
    const seen = new Set<string>();
    const emails: string[] = [];
    for (const email of [
      ...chips.map((chip) => chip.email),
      ...excludeEmails,
    ]) {
      if (seen.has(email)) continue;
      seen.add(email);
      emails.push(email);
    }
    return emails;
  }, [chips, excludeEmails]);

  const { suggestions, isAvailable, isLoading } = useRecentContacts({
    query: draft,
    excludeEmails: excluded,
    limit: draft.trim() ? 8 : 12,
  });

  const emit = useCallback(
    (nextChips: ParsedMailAddress[], nextDraft: string) => {
      const serialized = serializeRecipientField(nextChips, nextDraft);
      lastEmittedRef.current = serialized;
      onChangeText(serialized);
    },
    [onChangeText],
  );

  const applyField = useCallback(
    (nextChips: ParsedMailAddress[], nextDraft: string) => {
      chipsRef.current = nextChips;
      draftRef.current = nextDraft;
      setChips(nextChips);
      setDraft(nextDraft);
      emit(nextChips, nextDraft);
    },
    [emit],
  );

  useEffect(() => {
    if (value === lastEmittedRef.current) {
      return;
    }
    const next = parseRecipientField(value);
    lastEmittedRef.current = value;
    chipsRef.current = next.chips;
    draftRef.current = next.draft;
    setChips(next.chips);
    setDraft(next.draft);
  }, [value]);

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearBlurTimer();
  }, [clearBlurTimer]);

  const commitDraft = useCallback(
    (nextDraft: string, currentChips = chipsRef.current) => {
      const consumed = consumeRecipientDraft(nextDraft);
      const nextChips = consumed.chips.reduce(
        (result, chip) => addRecipientChip(result, chip),
        currentChips,
      );
      applyField(nextChips, consumed.draft);
    },
    [applyField],
  );

  const handleDraftChange = useCallback(
    (text: string) => {
      if (shouldCommitDraftOnChange(text)) {
        commitDraft(text);
        return;
      }
      applyField(chipsRef.current, text);
    },
    [applyField, commitDraft],
  );

  const handleRemove = useCallback(
    (email: string) => {
      applyField(removeRecipientChip(chipsRef.current, email), draftRef.current);
      inputRef.current?.focus();
    },
    [applyField],
  );

  const handleKeyPress = useCallback(
    (event: { nativeEvent: { key: string } }) => {
      if (event.nativeEvent.key !== "Backspace" || draftRef.current.length > 0) {
        return;
      }
      const last = chipsRef.current[chipsRef.current.length - 1];
      if (!last) return;
      handleRemove(last.email);
    },
    [handleRemove],
  );

  const selectSuggestion = useCallback(
    (entry: RecentContactEntry) => {
      selectingRef.current = true;
      clearBlurTimer();
      applyField(addRecipientChip(chipsRef.current, entry), "");
      setFocused(true);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        selectingRef.current = false;
      });
    },
    [applyField, clearBlurTimer],
  );

  const handleFocus = useCallback(() => {
    clearBlurTimer();
    setFocused(true);
  }, [clearBlurTimer]);

  const handleBlur = useCallback(() => {
    if (selectingRef.current) {
      return;
    }
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      if (selectingRef.current) {
        return;
      }
      setFocused(false);
      const pendingDraft = draftRef.current;
      const pendingChips = chipsRef.current;
      if (pendingDraft.trim() && isValidEmailAddress(pendingDraft.trim())) {
        commitDraft(pendingDraft, pendingChips);
      }
    }, BLUR_CLOSE_MS);
  }, [commitDraft]);

  const showList = focused;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.chips}>
          {chips.map((chip) => (
            <Pressable
              key={chip.email}
              onPress={() => handleRemove(chip.email)}
              style={styles.chip}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${recipientChipLabel(chip)}`}
            >
              <Text style={styles.chipText} numberOfLines={1}>
                {recipientChipLabel(chip)}
              </Text>
              <Feather
                name="x"
                size={11}
                color={theme.colors.mutedForeground}
              />
            </Pressable>
          ))}
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={draft}
            onChangeText={handleDraftChange}
            onKeyPress={handleKeyPress}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onSubmitEditing={() => {
              if (draft.trim()) {
                commitDraft(draft);
              }
            }}
            placeholder={chips.length === 0 && !draft ? placeholder : ""}
            placeholderTextColor={theme.colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            keyboardType="default"
            autoFocus={false}
            blurOnSubmit={false}
            returnKeyType="next"
            accessibilityLabel={placeholder}
          />
        </View>
        {trailing}
      </View>
      {showList ? (
        <ScrollView
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          nestedScrollEnabled
          removeClippedSubviews={false}
          style={styles.suggestionScroll}
        >
          <RecipientSuggestionList
            rows={suggestions}
            query={draft}
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
  const colors = mailColors(theme);

  const view = {
    container: {
      flexGrow: 0,
      flexShrink: 0,
    },
    suggestionScroll: {
      maxHeight: SUGGESTION_LIST_MAX_HEIGHT,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      minHeight: LAYOUT_METRICS.hitSize,
      paddingLeft: theme.spacing["4"],
      paddingRight: theme.spacing["2"],
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    chips: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingVertical: 8,
    },
    chip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      maxWidth: "100%" as const,
      height: 28,
      paddingLeft: 10,
      paddingRight: 6,
      borderRadius: theme.borderRadius.full,
      backgroundColor: colors.chipBg,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    chipText: {
      maxWidth: 200,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    input: {
      flexGrow: 1,
      flexBasis: 120,
      minWidth: 120,
      minHeight: 28,
      paddingVertical: 4,
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
