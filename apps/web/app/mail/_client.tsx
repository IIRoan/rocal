"use client";

import dynamic from "next/dynamic";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";

const MailApp = dynamic(
  () =>
    import("../../components/mail/mail-app").then((module) => module.MailApp),
  {
    ssr: false,
    loading: () => (
      <PageLoadingOverlay
        isLoading={true}
        messageContext="PAGE_LOAD"
        enableCycling
        priority
      />
    ),
  },
);

export function MailPageContent() {
  return <MailApp />;
}
