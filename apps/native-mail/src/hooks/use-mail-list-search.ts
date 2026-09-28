import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_MAIL_LIST_FILTERS,
  buildMailboxFieldSearchFilter,
  countActiveMailListFilters,
  getErrorMessage,
  hasMailSearchFieldValues,
  type MailListFilters,
  type MailSearchFieldValues,
} from "@workspace/calendar-core";
import { useMailboxFieldSearch } from "../lib/mail/use-mail";
import type { MailRuntime } from "../lib/mail/mail-runtime";

interface MailListSearchParams {
  runtime: MailRuntime | undefined;
  mailboxId: string | null;
  timezone?: string;
}

export function useMailListSearch({
  runtime,
  mailboxId,
  timezone,
}: MailListSearchParams) {
  const [listFilters, setListFilters] = useState<MailListFilters>(
    DEFAULT_MAIL_LIST_FILTERS,
  );
  const [fieldSearch, setFieldSearch] = useState<{
    fields: MailSearchFieldValues;
    revision: number;
  }>({ fields: {}, revision: 0 });

  useEffect(() => {
    setListFilters(DEFAULT_MAIL_LIST_FILTERS);
    setFieldSearch((prev) => ({ fields: {}, revision: prev.revision + 1 }));
  }, [mailboxId]);

  const fieldSearchActive = hasMailSearchFieldValues(fieldSearch.fields);
  const fieldSearchFilter = useMemo(
    () =>
      fieldSearchActive && mailboxId
        ? buildMailboxFieldSearchFilter(
            mailboxId,
            fieldSearch.fields,
            listFilters,
            {
              timezone,
              now: new Date(),
            },
          )
        : null,
    [fieldSearch.fields, fieldSearchActive, listFilters, mailboxId, timezone],
  );
  const fieldSearchQuery = useMailboxFieldSearch(
    runtime,
    mailboxId,
    fieldSearchFilter,
    fieldSearch.revision,
  );
  const searchMessages = useMemo(
    () =>
      fieldSearchActive
        ? (fieldSearchQuery.data?.pages.flatMap((page) => page.messages) ?? [])
        : [],
    [fieldSearchActive, fieldSearchQuery.data?.pages],
  );

  const handleSearchFieldsChange = useCallback(
    (fields: MailSearchFieldValues) =>
      setFieldSearch((prev) => ({ fields, revision: prev.revision + 1 })),
    [],
  );

  // Toggles fold into the server query, so a new revision keeps each distinct search in its own cache entry.
  const handleListFiltersChange = useCallback((next: MailListFilters) => {
    setListFilters(next);
    setFieldSearch((prev) => ({ ...prev, revision: prev.revision + 1 }));
  }, []);

  return {
    listFilters,
    handleListFiltersChange,
    fieldSearchFields: fieldSearch.fields,
    handleSearchFieldsChange,
    fieldSearchActive,
    listFilterActive:
      countActiveMailListFilters(listFilters) > 0 || fieldSearchActive,
    searchMessages,
    fieldSearchQuery,
    searchPending: fieldSearchActive && fieldSearchQuery.isPending,
    searchErrorMessage:
      fieldSearchActive && fieldSearchQuery.isError
        ? getErrorMessage(fieldSearchQuery.error, "Search failed. Try again.")
        : null,
  };
}
