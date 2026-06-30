/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import {
  MailComposeProvider,
  getMailComposeBridge,
  useMailCompose,
  useMailComposeChrome,
  useMailComposeClosePrompt,
} from "@/components/mail/mail-compose-context";
import { resolveMailServerLimits } from "@workspace/calendar-core";

const fallbackMailServerLimits = resolveMailServerLimits({});

function ComposeProbe({
  onReady,
}: {
  onReady: (value: ReturnType<typeof useMailCompose>) => void;
}) {
  const compose = useMailCompose();
  React.useEffect(() => {
    onReady(compose);
  }, [compose, onReady]);
  return null;
}

function ChromeProbe({
  onReady,
}: {
  onReady: (value: ReturnType<typeof useMailComposeChrome>) => void;
}) {
  const chrome = useMailComposeChrome();
  React.useEffect(() => {
    onReady(chrome);
  }, [chrome, onReady]);
  return null;
}

function ClosePromptProbe({
  onReady,
}: {
  onReady: (value: ReturnType<typeof useMailComposeClosePrompt>) => void;
}) {
  const prompt = useMailComposeClosePrompt();
  React.useEffect(() => {
    onReady(prompt);
  }, [prompt, onReady]);
  return null;
}

describe("useMailCompose", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("updates draft fields and exposes them via the bridge", async () => {
    let latest: ReturnType<typeof useMailCompose> | null = null;

    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ComposeProbe onReady={(value) => { latest = value; }} />
        </MailComposeProvider>,
      );
    });

    expect(latest).not.toBeNull();

    await act(async () => {
      latest!.setComposeTo("bob@solace.onl");
      latest!.setComposeSubject("Subject");
      latest!.setComposeBody("Body");
    });

    const draft = getMailComposeBridge()?.getDraft();
    expect(draft).toEqual(
      expect.objectContaining({
        to: "bob@solace.onl",
        subject: "Subject",
        body: "Body",
        replyContext: null,
      }),
    );
  });

  it("resetDraft clears compose state", async () => {
    let latest: ReturnType<typeof useMailCompose> | null = null;

    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ComposeProbe onReady={(value) => { latest = value; }} />
        </MailComposeProvider>,
      );
    });

    await act(async () => {
      latest!.setComposeTo("alice@solace.onl");
      latest!.setComposeBody("Draft body");
    });

    await act(async () => {
      getMailComposeBridge()?.resetDraft();
    });

    expect(getMailComposeBridge()?.getDraft().to).toBe("");
    expect(getMailComposeBridge()?.getDraft().body).toBe("");
  });

  it("clearCompose wipes fields without closing chrome", async () => {
    let latest: ReturnType<typeof useMailCompose> | null = null;
    let chrome: ReturnType<typeof useMailComposeChrome> | null = null;

    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ChromeProbe onReady={(value) => { chrome = value; }} />
          <ComposeProbe onReady={(value) => { latest = value; }} />
        </MailComposeProvider>,
      );
    });

    await act(async () => {
      latest!.setComposeTo("alice@solace.onl");
      latest!.setComposeBody("Draft body");
      chrome!.setIsComposeOpen(true);
      chrome!.setIsFullCompose(true);
    });

    await act(async () => {
      latest!.clearCompose();
    });

    expect(getMailComposeBridge()?.getDraft().to).toBe("");
    expect(getMailComposeBridge()?.getDraft().body).toBe("");
    expect(chrome?.isComposeOpen).toBe(true);
    expect(chrome?.isFullCompose).toBe(true);
  });

  it("seedDraft opens full compose with message fields", async () => {
    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ComposeProbe onReady={() => {}} />
        </MailComposeProvider>,
      );
    });

    const message = {
      id: "draft-1",
      subject: "Saved draft",
      to: [{ email: "bob@solace.onl" }],
      cc: [],
      bcc: [],
      keywords: { $draft: true },
    } as const;

    let chrome: ReturnType<typeof useMailComposeChrome> | null = null;

    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ChromeProbe onReady={(value) => { chrome = value; }} />
        </MailComposeProvider>,
      );
    });

    await act(async () => {
      getMailComposeBridge()?.seedDraft(message as never);
    });

    const draft = getMailComposeBridge()?.getDraft();
    expect(draft).toEqual(
      expect.objectContaining({
        to: "bob@solace.onl",
        subject: "Saved draft",
      }),
    );
    expect(chrome?.isFullCompose).toBe(true);
    expect(chrome?.isComposeOpen).toBe(false);
    expect(getMailComposeBridge()?.getDraftIdRef()).toBe("draft-1");
  });

  it("prompts before closing a saved draft even when not dirty", async () => {
    let latest: ReturnType<typeof useMailCompose> | null = null;
    let prompt: ReturnType<typeof useMailComposeClosePrompt> | null = null;

    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ComposeProbe onReady={(value) => { latest = value; }} />
          <ClosePromptProbe onReady={(value) => { prompt = value; }} />
        </MailComposeProvider>,
      );
    });

    const message = {
      id: "draft-1",
      subject: "Saved draft",
      to: [{ email: "bob@solace.onl" }],
      cc: [],
      bcc: [],
      keywords: { $draft: true },
    } as const;

    await act(async () => {
      getMailComposeBridge()?.seedDraft(message as never);
    });

    await act(async () => {
      getMailComposeBridge()?.acknowledgeSavedDraft();
    });

    expect(getMailComposeBridge()?.isComposeDirty()).toBe(false);

    let allowed = true;
    await act(async () => {
      allowed = latest!.requestComposeClose();
    });

    expect(allowed).toBe(false);
    expect(prompt?.composeClosePromptOpen).toBe(true);
  });

  it("seedReply sets reply mode and threading context", async () => {
    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ComposeProbe onReady={() => {}} />
        </MailComposeProvider>,
      );
    });

    const message = {
      id: "msg-1",
      subject: "Question",
      from: [{ email: "bob@solace.onl", name: "Bob" }],
      to: [{ email: "alice@solace.onl" }],
      cc: [],
      bcc: [],
      receivedAt: "2026-06-19T10:00:00.000Z",
      textBody: [{ partId: "1", type: "text/plain" }],
      bodyValues: { "1": { value: "Hello?" } },
    } as const;

    await act(async () => {
      getMailComposeBridge()?.seedReply(message as never, null);
    });

    const draft = getMailComposeBridge()?.getDraft();
    expect(draft?.to).toBe("bob@solace.onl");
    expect(draft?.subject).toBe("Re: Question");
    expect(draft?.composeMode).toBe("reply");
    expect(draft?.replyContext).toEqual(
      expect.objectContaining({ threadId: null }),
    );
  });
});
