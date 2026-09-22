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
import { useMailSkin, type MailSkin } from "./mail-ui";
import { RecipientSuggestionList } from "./RecipientSuggestionList";
import {
  collapseRecipientChips,
  recipientInitial,
} from "../../lib/mail/compose-display";
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
  label: string;
  trailing?: ReactNode;
  excludeEmails?: string[];
};

export function ComposeRecipientField({
  value,
  onChangeText,
  label,
  trailing,
  excludeEmails = EMPTY_EMAILS,
}: ComposeRecipientFieldProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
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

  const { visible, hiddenCount } = collapseRecipientChips(chips, focused);
  const collapsed = !focused && chips.length > 0;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.row}
        onPress={() => inputRef.current?.focus()}
        accessible={false}
      >
        <Text style={styles.label}>{label}</Text>
        <View style={styles.chips}>
          {visible.map((chip) => {
            const chipLabel = recipientChipLabel(chip);
            return (
              <Pressable
                key={chip.email}
                onPress={() =>
                  focused ? handleRemove(chip.email) : inputRef.current?.focus()
                }
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={
                  focused ? `Remove ${chipLabel}` : `${label}: ${chipLabel}`
                }
              >
                <View style={styles.chipAvatar}>
                  <Text style={styles.chipAvatarText}>
                    {recipientInitial(chipLabel)}
                  </Text>
                </View>
                <Text style={styles.chipText} numberOfLines={1}>
                  {chipLabel}
                </Text>
                {focused ? (
                  <Feather name="x" size={12} color={skin.textTertiary} />
                ) : null}
              </Pressable>
            );
          })}
          {hiddenCount > 0 ? (
            <Pressable
              onPress={() => inputRef.current?.focus()}
              style={({ pressed }) => [
                styles.chip,
                styles.overflowChip,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Show ${hiddenCount} more recipients`}
            >
              <Text style={styles.chipText}>+{hiddenCount}</Text>
            </Pressable>
          ) : null}
          <TextInput
            ref={inputRef}
            style={[styles.input, collapsed && styles.inputCollapsed]}
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
            placeholderTextColor={skin.textTertiary}
            selectionColor={skin.accent}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            keyboardType="default"
            autoFocus={false}
            blurOnSubmit={false}
            returnKeyType="next"
            accessibilityLabel={label}
          />
        </View>
        {trailing}
      </Pressable>
      {focused ? (
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

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    container: {
      flexGrow: 0,
      flexShrink: 0,
    },
    suggestionScroll: {
      maxHeight: SUGGESTION_LIST_MAX_HEIGHT,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: skin.borderTertiary,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      minHeight: LAYOUT_METRICS.hitSize + theme.spacing["1"],
      paddingLeft: theme.spacing["4"],
      paddingRight: theme.spacing["1"],
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: skin.borderTertiary,
    },
    chips: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingVertical: theme.spacing["2"],
    },
    chip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      maxWidth: "100%" as const,
      height: 28,
      paddingLeft: 3,
      paddingRight: 10,
      borderRadius: theme.borderRadius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: skin.borderPrimary,
      backgroundColor: skin.surface,
    },
    overflowChip: {
      paddingLeft: 10,
    },
    chipAvatar: {
      width: 20,
      height: 20,
      borderRadius: theme.borderRadius.full,
      backgroundColor: skin.field,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    pressed: {
      backgroundColor: skin.pressed,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    label: {
      ...skin.meta,
      marginRight: theme.spacing["2"],
    },
    chipAvatarText: {
      fontSize: 10,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: skin.textSecondary,
    },
    chipText: {
      maxWidth: 180,
      fontSize: 13,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    input: {
      flexGrow: 1,
      flexBasis: 120,
      minWidth: 120,
      minHeight: 28,
      paddingVertical: 4,
      fontSize: skin.body.fontSize,
      color: theme.colors.foreground,
    },
    inputCollapsed: {
      flexBasis: 24,
      minWidth: 24,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
