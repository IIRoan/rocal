import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type TextInput } from "react-native";
import { useRouter } from "expo-router";
import { isBodyOnlyMatch, type TimeFormat } from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useCommandPalette } from "@workspace/native-core/providers/CommandPaletteProvider";
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
const SEARCH_HINT = "Search by subject, sender or message text.";

/** Search-only drawer over the on-device subject index and live mailbox results. */
export function CommandPalette() {
  const { theme } = useTheme();
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const titleIndex = useNativeTitleIndex();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const accountQuery = useMailAccount();
  const mailProvisioned = accountQuery.data?.provisioned ?? false;
  const runtime = useMailRuntime(isOpen && mailProvisioned).data;
  const { selectedMailboxId } = useMailSelection();

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
  const searchEnabled = isOpen && trimmedQuery.length >= SEARCH_MIN_LENGTH;

  const { data: mailSearchData, isFetching: mailSearchFetching } =
    usePaletteMailSearch(runtime, selectedMailboxId, trimmedQuery, {
      enabled: searchEnabled,
      limit: SEARCH_LIMIT,
    });

  const results = useMemo(
    () =>
      searchEnabled
        ? mergePaletteSearchResults({
            titleDocuments: titleIndex.documents,
            query: trimmedQuery,
            messages: mailSearchData?.messages ?? [],
            limit: SEARCH_LIMIT,
          })
        : [],
    [
      mailSearchData?.messages,
      searchEnabled,
      titleIndex.documents,
      trimmedQuery,
    ],
  );

  const handleCloseComplete = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const handleResultPress = useCallback(
    (result: NativePaletteSearchResult) => {
      close();
      router.push(mailMessageRoute(result.messageId) as never);
    },
    [close, router],
  );

  const searching =
    query.trim().length >= SEARCH_MIN_LENGTH &&
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

        {results.length > 0 ? (
          <SheetSection title="Messages">
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
          <SheetCenteredState
            message={
              titleIndex.pendingBodies > 0
                ? `No matches yet. Still indexing message text (${titleIndex.pendingBodies} left).`
                : "No matching messages."
            }
          />
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
