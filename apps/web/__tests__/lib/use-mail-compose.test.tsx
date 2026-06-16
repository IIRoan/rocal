/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import {
  MailComposeProvider,
  getMailComposeBridge,
  useMailCompose,
  useMailComposeChrome,
} from "@/components/mail/mail-compose-context";

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
        <MailComposeProvider>
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
        <MailComposeProvider>
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
        <MailComposeProvider>
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
        <MailComposeProvider>
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
        <MailComposeProvider>
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
  });
});
