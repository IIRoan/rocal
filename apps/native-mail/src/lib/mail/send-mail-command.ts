import { sendJmapMailCommand, type MailCommand } from "@workspace/calendar-core";
import { getPrimaryMailAccountId } from "./jmap-client";
import type { MailRuntime } from "./mail-runtime";
import { createMailSealer } from "./outgoing-message-crypto";
import type { resolveComposeContext } from "./use-mail";

/** Sends a list or alias command from the identity in `context`. */
export function sendMailCommand(
  runtime: MailRuntime,
  context: NonNullable<ReturnType<typeof resolveComposeContext>>,
  actionId: string,
  command: MailCommand,
): Promise<void> {
  return sendJmapMailCommand(
    {
      client: runtime.client,
      session: runtime.session,
      accountId: getPrimaryMailAccountId(runtime.session),
      createSealer: () => createMailSealer(runtime),
    },
    context,
    actionId,
    command,
  );
}
