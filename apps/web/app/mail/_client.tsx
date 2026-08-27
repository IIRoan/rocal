"use client";

import { useSyncExternalStore } from "react";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import { MailApp } from "../../components/mail/mail-app";

export function MailPageContent() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <PageLoadingOverlay
        isLoading={true}
        messageContext="PAGE_LOAD"
        enableCycling
        priority
      />
    );
  }

  return <MailApp />;
}
