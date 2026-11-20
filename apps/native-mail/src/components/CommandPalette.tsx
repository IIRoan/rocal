import {
  conditionToChip,
  formatMailSearchQuery,
  hasMailSearchConditions,
  parseMailSearchQuery,
  isBodyOnlyMatch,
  privateSearchCoverageText,
  type MailSearchContext,
  type TimeFormat,
} from "@workspace/calendar-core";
import { useEffect, useRef, useState } from "react";
import { type TextInputInstance } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useCommandPalette } from "@workspace/native-core/providers/CommandPaletteProvider";
import { useDeferredSheetAction } from "@workspace/native-core/hooks/use-deferred-sheet-action";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { BottomSheet } from "@workspace/native-core/components/BottomSheet";
import { BlobatarAvatar } from "@workspace/native-core/components/BlobatarAvatar";
import { MAIL_LAYOUT } from "@workspace/native-core/components/mail/mail-ui";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSearchField,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useMailSelection } from "../providers/MailSelectionProvider";
import { useMailAccount, useMailRuntime } from "../lib/mail/use-mail";
import { useLabels } from "../lib/mail/use-labels";
import { formatMessageDate } from "../lib/mail/mail-helpers";
import { mailMessageRoute } from "../lib/mail-routes";
import { useNativeTitleIndex } from "../hooks/use-native-title-index";
import {
  mergePaletteSearchResults,
  type NativePaletteSearchResult,
} from "../lib/search/palette-search";
import { usePaletteMailSearch } from "./command-palette/use-palette-mail-search";

const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 12;
const SEARCH_HINT = "Search by subject, sender or message text, or type from:, in:, is:unread and more.";

/** Search-only drawer over the on-device subject index and live mailbox results. */
export function CommandPalette() {
  const { theme } = useTheme();
  const { isOpen, close } = useCommandPalette();
  const { push } = useRouter();
  const inputRef = useRef<TextInputInstance>(null);
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const titleIndex = useNativeTitleIndex();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const accountQuery = useMailAccount();
  const mailProvisioned = accountQuery.data?.provisioned ?? false;
  const runtime = useMailRuntime(isOpen && mailProvisioned).data;
  const { selectedMailboxId } = useMailSelection();
  const { labels } = useLabels({ runtime, enabled: isOpen && mailProvisioned });
  // Folder and label names resolve here on the device; only ids reach the search.
  const searchContext: MailSearchContext = { mailboxes: runtime?.mailboxes ?? [], labels };

  useEffect(() => {
    if (!isOpen) return;
    const timeout = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedQuery(query),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timeout);
  }, [query]);

  const trimmedQuery = debouncedQuery.trim();
  const parsed = parseMailSearchQuery(trimmedQuery, searchContext);
  const operatorSearch = hasMailSearchConditions(parsed);
  // Unusable operators are dropped rather than searched as words.
  const searchText = parsed.unresolved ? parsed.text : trimmedQuery;
  const searchEnabled =
    isOpen && (operatorSearch || searchText.length >= SEARCH_MIN_LENGTH);

  // With the on-device index on, results come only from it, even while it builds, so the words never reach the mail server.
  const searchesLocally = titleIndex.enabled;
  const { data: mailSearchData, isFetching: mailSearchFetching } =
    usePaletteMailSearch(runtime, selectedMailboxId, searchText, {
      enabled: searchEnabled && (operatorSearch || !searchesLocally),
      limit: SEARCH_LIMIT,
      parsed,
      searchesLocally,
      timezone,
    });

  const results = searchEnabled
    ? mergePaletteSearchResults({
        // Index hits ignore typed conditions, so an operator search shows only the filtered messages.
        titleDocuments: operatorSearch ? [] : titleIndex.documents,
        query: searchText,
        messages: mailSearchData?.messages ?? [],
        limit: SEARCH_LIMIT,
      })
    : [];
  const typed = parseMailSearchQuery(query.trim(), searchContext);
  const removeFilter = (index: number) =>
    setQuery(
      formatMailSearchQuery(
        [typed.text, typed.unresolved].filter(Boolean).join(" "),
        typed.filters.conditions.filter((_, position) => position !== index),
      ),
    );

  const { runAfterClose, onCloseComplete } = useDeferredSheetAction(close);

  const handleCloseComplete = () => {
    setQuery("");
    setDebouncedQuery("");
    onCloseComplete();
  };

  const handleResultPress = (result: NativePaletteSearchResult) =>
    runAfterClose(() => push(mailMessageRoute(result.messageId) as never));

  const searching =
    (query.trim().length >= SEARCH_MIN_LENGTH || hasMailSearchConditions(typed)) &&
    (query.trim() !== trimmedQuery ||
      mailSearchFetching ||
      titleIndex.isIndexing);

  return (
    <BottomSheet
      visible={isOpen}
      onDismiss={close}
      onCloseComplete={handleCloseComplete}
    >
      <SheetScroll>
        <SheetSearchField
          inputRef={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search mail"
          accessibilityLabel="Search mail"
        />

        {hasMailSearchConditions(typed) || typed.issues.length > 0 ? (
          <SheetSection title="Filters" footer={typed.issues.join(" ") || undefined}>
            <SheetGroup>
              {typed.filters.conditions.map((condition, index) => {
                const label = conditionToChip(condition)
                  .map((chip) => chip.label)
                  .join(" ");
                return (
                  <SheetItem
                    key={label}
                    label={label}
                    accessory="x"
                    onPress={() => removeFilter(index)}
                    accessibilityLabel={`Remove filter ${label}`}
                  />
                );
              })}
            </SheetGroup>
          </SheetSection>
        ) : null}

        {results.length > 0 ? (
          <SheetSection
            title="Messages"
            footer={
              titleIndex.enabled
                ? privateSearchCoverageText(titleIndex.coverage)
                : undefined
            }
          >
            <SheetGroup>
              {results.map((result) => (
                <SheetItem
                  key={result.id}
                  leading={
                    <BlobatarAvatar
                      email={result.message.from?.[0]?.email}
                      name={result.from}
                      size={MAIL_LAYOUT.rowAvatarSize}
                      borderRadius={theme.borderRadius.md}
                    />
                  }
                  label={result.title || "(no subject)"}
                  detail={searchResultDetail(result, { timeFormat, timezone })}
                  onPress={() => handleResultPress(result)}
                />
              ))}
            </SheetGroup>
          </SheetSection>
        ) : !searchEnabled && !searching ? (
          <SheetCenteredState message={SEARCH_HINT} />
        ) : searching ? (
          <SheetCenteredState loading message="Searching…" />
        ) : (
          <SheetSection
            footer={
              titleIndex.enabled
                ? privateSearchCoverageText(titleIndex.coverage)
                : undefined
            }
          >
            <SheetCenteredState
              message={
                titleIndex.pendingBodies > 0
                  ? `No matches yet. Still indexing message text (${titleIndex.pendingBodies} left).`
                  : "No matches in indexed mail."
              }
            />
          </SheetSection>
        )}
      </SheetScroll>
    </BottomSheet>
  );
}

function searchResultDetail(
  result: NativePaletteSearchResult,
  options: { timeFormat: TimeFormat; timezone?: string },
): string | undefined {
  if (isBodyOnlyMatch(result.matchedFields) && result.snippet) {
    return result.snippet;
  }
  const date = formatMessageDate(result.timestamp, options);
  return [result.from, date].filter(Boolean).join(" · ") || undefined;
}
