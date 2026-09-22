"use client";

import type { ReactNode } from "react";
import type { MailServerLimits } from "@workspace/calendar-core";
import type { JmapIdentity } from "@/lib/mail/types";
import {
  MailComposeChromeContext,
  MailComposeFieldsContext,
} from "./mail-compose-contexts";
import { useMailComposeController } from "./use-mail-compose-controller";

const EMPTY_IDENTITIES: JmapIdentity[] = [];

export function MailComposeProvider({
  children,
  identities = EMPTY_IDENTITIES,
  mailServerLimits,
}: {
  children: ReactNode;
  identities?: JmapIdentity[];
  mailServerLimits: MailServerLimits;
}) {
  const { fieldsValue, chromeValue } = useMailComposeController({
    identities,
    mailServerLimits,
  });

  return (
    <MailComposeChromeContext.Provider value={chromeValue}>
      <MailComposeFieldsContext.Provider value={fieldsValue}>
        {children}
      </MailComposeFieldsContext.Provider>
    </MailComposeChromeContext.Provider>
  );
}
