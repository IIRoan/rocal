"use client";

import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import { useMailApp } from "@/hooks/use-mail-app";
import { useComposeDraftAutosave } from "@/hooks/use-compose-draft-autosave";
import {
  MailComposeProvider,
} from "./mail-compose-context";
import { ComposeCloseConfirmDialog } from "./compose-close-confirm-dialog";
import { useMailAppContentController } from "./use-mail-app-content-controller";
import { MailAppMainLayout } from "./mail-app/mail-app-main-layout";
import { MailAppOverlays } from "./mail-app/mail-app-overlays";

function MailComposeAutosave({
  activeMailbox,
  accountEmail,
  onDraftSaved,
}: {
  activeMailbox: {
    client: import("@/lib/mail/jmap-client").StalwartJmapClient;
    session: import("@/lib/mail/types").JmapSession;
    mailboxes: import("@/lib/mail/types").JmapMailbox[];
    identities: import("@/lib/mail/types").JmapIdentity[];
    email: string;
    mailServerPolicy: import("@workspace/calendar-core").MailServerPolicy;
  } | null;
  accountEmail: string;
  onDraftSaved: Parameters<typeof useComposeDraftAutosave>[0]["onDraftSaved"];
}) {
  useComposeDraftAutosave({
    client: activeMailbox?.client ?? null,
    session: activeMailbox?.session ?? null,
    mailboxes: activeMailbox?.mailboxes ?? [],
    identities: activeMailbox?.identities ?? [],
    fallbackFromEmail: activeMailbox?.email ?? accountEmail,
    mailServerPolicy: activeMailbox?.mailServerPolicy ?? null,
    enabled: Boolean(activeMailbox),
    onDraftSaved,
  });
  return null;
}

export function MailApp() {
  const mail = useMailApp();

  if (mail.isSessionPending || !mail.session?.user) {
    return (
      <PageLoadingOverlay
        isLoading={true}
        messageContext="PAGE_LOAD"
        enableCycling
        priority
      />
    );
  }

  return (
    <MailComposeProvider
      identities={mail.activeMailbox?.pickerIdentities ?? []}
      mailServerLimits={mail.composeMailPolicy.limits}
    >
      <MailComposeAutosave
        activeMailbox={mail.activeMailbox}
        accountEmail={mail.accountEmail}
        onDraftSaved={mail.handleDraftSaved}
      />
      <ComposeCloseConfirmDialog />
      <MailAppContent mail={mail} />
    </MailComposeProvider>
  );
}

function MailAppContent({ mail }: { mail: ReturnType<typeof useMailApp> }) {
  const controller = useMailAppContentController(mail);

  return (
    <>
      <MailAppMainLayout controller={controller} />
      <MailAppOverlays controller={controller} />
    </>
  );
}
