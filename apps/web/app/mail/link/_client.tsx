"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseMailtoLink } from "@workspace/calendar-core";
import { Logo } from "@workspace/ui/components/layout";
import {
  resolveMailLink,
  setPendingMailto,
  type MailLink,
} from "@/lib/mail/mail-link-handoff";

const EXPIRED_MESSAGE = "This link has expired. Open it again from the message.";
const INVALID_MAILTO_MESSAGE = "This email link can't be opened.";

type MailLinkPageState = { status: "resolving" } | { status: "error"; message: string };

export function MailLinkPageContent() {
  const router = useRouter();
  const [state, setState] = useState<MailLinkPageState>({ status: "resolving" });
  const linkIdRef = useRef<string | null>(null);

  // The fragment holds only an opaque id; it leaves the address bar and history before the reader tab is asked.
  useEffect(() => {
    if (linkIdRef.current === null) {
      linkIdRef.current = window.location.hash.slice(1);
      window.history.replaceState(null, "", window.location.pathname);
    }
    let current = true;
    const open = (link: MailLink | null) => {
      if (!current) return;
      const draft = link ? parseMailtoLink(link.href) : null;
      if (!link) {
        setState({ status: "error", message: EXPIRED_MESSAGE });
      } else if (!draft) {
        setState({ status: "error", message: INVALID_MAILTO_MESSAGE });
      } else {
        setPendingMailto(draft);
        router.replace("/mail");
      }
    };
    resolveMailLink(linkIdRef.current).then(open, () => open(null));
    return () => {
      current = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-[100dvh]">
      <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <Logo width={44} height={44} className="mb-10 text-accent" aria-label="Solace" />
          {state.status === "resolving" ? (
            <p role="status" className="text-sm text-muted-foreground">
              Opening link…
            </p>
          ) : (
            <p role="alert" className="text-sm text-foreground">
              {state.message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
