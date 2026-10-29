import { useState } from "react";
import { resolveMessageReplyFrom } from "@workspace/calendar-core";
import type { ComposeMode } from "../lib/mail/compose-request";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import type { JmapEmailMessage, JmapIdentity } from "../lib/mail/types";
import { resolveComposeContext } from "../lib/mail/use-mail";

const NO_IDENTITIES: JmapIdentity[] = [];

type ComposeIdentityInput = {
  runtime: MailRuntime | undefined;
  sourceMessage: JmapEmailMessage | null;
  mode: ComposeMode | undefined;
  autoSelectReplyIdentity: boolean;
};

export function useComposeIdentity({
  runtime,
  sourceMessage,
  mode,
  autoSelectReplyIdentity,
}: ComposeIdentityInput) {
  const [pickedIdentityId, setPickedIdentityId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const identities = runtime?.pickerIdentities ?? NO_IDENTITIES;
  const replyFromIdentityId =
    autoSelectReplyIdentity &&
    sourceMessage &&
    (mode === "reply" || mode === "reply-all" || mode === "forward")
      ? resolveMessageReplyFrom(identities, sourceMessage)?.identityId
      : undefined;
  const autoReplyIdentityId =
    identities.find((entry) => entry.id === replyFromIdentityId)?.id ?? null;
  // An explicit pick wins, then the identity a reply was addressed to, then the first identity.
  const selectedIdentityId =
    pickedIdentityId ?? autoReplyIdentityId ?? identities[0]?.id ?? null;
  const selectedIdentity =
    identities.find((entry) => entry.id === selectedIdentityId) ??
    identities[0] ??
    null;
  const composeContext = resolveComposeContext(
    runtime,
    selectedIdentityId ?? undefined,
  );

  const pick = (id: string) => {
    setPickedIdentityId(id);
    setPickerOpen(false);
  };

  return {
    identities,
    autoReplyIdentityId,
    selectedIdentityId,
    selectedIdentity,
    composeContext,
    pickerOpen,
    setPickerOpen,
    pick,
  };
}
