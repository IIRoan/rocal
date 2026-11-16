"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  assessMailLink,
  describeMailLink,
  describeMailUnsubscribe,
  MAIL_UNSUBSCRIBE_LABELS,
  parseMailtoLink,
} from "@workspace/calendar-core";
import { Logo } from "@workspace/ui/components/layout";
import { Button } from "@workspace/ui/components/ui/button";
import {
  canonicalMailLinkUrl,
  oneClickUnsubscribeUrl,
  openMailDocument,
  openMailLinkTarget,
  resolveMailLink,
  takeMailLinkFragment,
  type MailLink,
} from "@/lib/mail/mail-link-handoff";

const EXPIRED_MESSAGE = "This link has expired. Open it again from the message.";
const INVALID_MAILTO_MESSAGE = "This email link can't be opened.";
const SHOWN_URL_MAX_LENGTH = 300;

type MailLinkPageState =
  | { status: "resolving" }
  | { status: "error"; message: string }
  | { status: "confirm"; url: string; title: string; lines: string[] }
  | { status: "unsubscribe"; url: string; title: string; lines: string[] };

function resolvedState(link: MailLink | null): MailLinkPageState {
  if (!link) return { status: "error", message: EXPIRED_MESSAGE };
  if (link.kind === "unsubscribe") {
    const url = oneClickUnsubscribeUrl(link.href);
    if (!url) return { status: "error", message: EXPIRED_MESSAGE };
    const description = describeMailUnsubscribe({ type: "one-click", url }, link.text || "your address");
    return { status: "unsubscribe", url, title: MAIL_UNSUBSCRIBE_LABELS.title, lines: [description] };
  }
  if (/^mailto:/i.test(link.href)) {
    return { status: "error", message: INVALID_MAILTO_MESSAGE };
  }
  const url = canonicalMailLinkUrl(link.href);
  if (!url) return { status: "error", message: EXPIRED_MESSAGE };
  return { status: "confirm", url: url.href, ...describeMailLink(assessMailLink(url.href, link.text)) };
}

export function MailLinkPageContent() {
  const [state, setState] = useState<MailLinkPageState>({ status: "resolving" });
  const linkIdRef = useRef<string | null>(null);

  // The reader tab's answer arrives from outside React, so acting on it is an event, not render work.
  const onResolved = useEffectEvent((id: string, link: MailLink | null) => {
    if (link && parseMailtoLink(link.href)) {
      openMailDocument(id);
      return;
    }
    setState(resolvedState(link));
  });

  // The fragment holds only an opaque id; it leaves the address bar and history before the reader tab is asked.
  useEffect(() => {
    if (linkIdRef.current === null) linkIdRef.current = takeMailLinkFragment();
    const id = linkIdRef.current;
    let current = true;
    resolveMailLink(id).then(
      (link) => {
        if (current) onResolved(id, link);
      },
      () => {
        if (current) onResolved(id, null);
      },
    );
    return () => {
      current = false;
    };
  }, []);

  const cancel = () => {
    window.close();
    openMailDocument();
  };

  return (
    <main className="flex min-h-[100dvh]">
      <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <Logo width={44} height={44} className="mb-10 text-accent" aria-label="Solace" />
          {state.status === "resolving" ? (
            <p role="status" className="text-sm text-muted-foreground">
              Opening link…
            </p>
          ) : state.status === "error" ? (
            <p role="alert" className="text-sm text-foreground">
              {state.message}
            </p>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground">
                {state.title}
              </h1>
              <div className="mt-3 flex flex-col gap-2 text-sm text-pretty text-foreground">
                {state.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <p className="mt-4 text-xs break-all text-muted-foreground">
                {state.url.length > SHOWN_URL_MAX_LENGTH
                  ? `${state.url.slice(0, SHOWN_URL_MAX_LENGTH)}…`
                  : state.url}
              </p>
              {state.status === "unsubscribe" ? (
                // RFC 8058's request is exactly this form post; it replaces the page so the sender's answer shows here.
                <form method="post" action={state.url} rel="noreferrer" className="mt-8 flex gap-2">
                  <input type="hidden" name="List-Unsubscribe" value="One-Click" />
                  <Button type="submit">{MAIL_UNSUBSCRIBE_LABELS.action}</Button>
                  <Button type="button" variant="outline" onClick={cancel}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <div className="mt-8 flex gap-2">
                  <Button type="button" onClick={() => openMailLinkTarget(state.url)}>
                    Open link
                  </Button>
                  <Button type="button" variant="outline" onClick={cancel}>
                    Cancel
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
