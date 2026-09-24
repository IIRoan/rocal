"use client";

import type { ReactNode } from "react";
import type { MailServerLimits } from "@workspace/calendar-core";
import type { JmapIdentity } from "@/lib/mail/types";
import {
  MailComposeChromeContext,
  MailComposeFieldsContext,
} from "./mail-compose-contexts";
import type { QuotedDateOptions } from "./mail-compose-seed";
import { useMailComposeController } from "./use-mail-compose-controller";

const EMPTY_IDENTITIES: JmapIdentity[] = [];

export function MailComposeProvider({
  children,
  identities = EMPTY_IDENTITIES,
  mailServerLimits,
  quoteDateOptions,
}: {
  children: ReactNode;
  identities?: JmapIdentity[];
  mailServerLimits: MailServerLimits;
  quoteDateOptions: QuotedDateOptions;
}) {
  const { fieldsValue, chromeValue } = useMailComposeController({
    identities,
    mailServerLimits,
    quoteDateOptions,
  });

  return (
    <MailComposeChromeContext.Provider value={chromeValue}>
      <MailComposeFieldsContext.Provider value={fieldsValue}>
        {children}
      </MailComposeFieldsContext.Provider>
    </MailComposeChromeContext.Provider>
  );
}
