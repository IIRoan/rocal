/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import {
  MailComposeProvider,
  useMailCompose,
  useMailComposeChrome,
} from "@/components/mail/mail-compose-context";
import {
  getMailComposeBridge,
  registerComposeCloseActions,
  registerComposeDraftSaver,
} from "@/components/mail/mail-compose-bridge";
import { resolveMailServerLimits } from "@workspace/calendar-core";

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { error: jest.fn() }),
}));

const mockToast = jest.mocked(toast);
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
    registerComposeDraftSaver(null);
    registerComposeCloseActions(null);
    mockToast.mockClear();
    mockToast.error.mockClear();
  });

  function registerCloseHarness(flushResult: string | null) {
    const closeActions = { dismiss: jest.fn(), discardDraft: jest.fn() };
    registerComposeCloseActions(closeActions);
    registerComposeDraftSaver({
      save: async () => flushResult,
      flush: async () => flushResult,
      cancelPending: () => {},
    });
    return closeActions;
  }

  function toastDiscardAction(mock: { mock: { calls: unknown[][] } }) {
    const options = mock.mock.calls.at(-1)?.[1] as
      | { action: { label: string; onClick: () => void } }
      | undefined;
    return options?.action;
  }

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

  it("closes a clean saved draft immediately and offers discard", async () => {
    let latest: ReturnType<typeof useMailCompose> | null = null;
    const closeActions = registerCloseHarness("draft-1");

    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ComposeProbe onReady={(value) => { latest = value; }} />
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

    let allowed = false;
    await act(async () => {
      allowed = latest!.requestComposeClose();
    });

    expect(allowed).toBe(true);
    expect(mockToast).toHaveBeenCalledWith("Draft saved", expect.anything());
    const action = toastDiscardAction(mockToast);
    expect(action?.label).toBe("Discard");
    action?.onClick();
    expect(closeActions.discardDraft).toHaveBeenCalledWith("draft-1");
  });

  it("saves a dirty draft before closing", async () => {
    let latest: ReturnType<typeof useMailCompose> | null = null;
    const closeActions = registerCloseHarness("draft-9");
    const afterClose = jest.fn();

    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ComposeProbe onReady={(value) => { latest = value; }} />
        </MailComposeProvider>,
      );
    });

    await act(async () => {
      latest!.setComposeSubject("Unsaved");
    });

    let allowed = true;
    await act(async () => {
      allowed = latest!.requestComposeClose(afterClose);
    });

    expect(allowed).toBe(false);
    expect(closeActions.dismiss).toHaveBeenCalledTimes(1);
    expect(afterClose).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith("Draft saved", expect.anything());
  });

  it("keeps compose open when the draft save fails", async () => {
    let latest: ReturnType<typeof useMailCompose> | null = null;
    const closeActions = registerCloseHarness(null);

    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ComposeProbe onReady={(value) => { latest = value; }} />
        </MailComposeProvider>,
      );
    });

    await act(async () => {
      latest!.setComposeBody("Do not lose me");
    });

    await act(async () => {
      latest!.requestComposeClose();
    });

    expect(closeActions.dismiss).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      "Couldn't save draft",
      expect.anything(),
    );
    toastDiscardAction(mockToast.error)?.onClick();
    expect(closeActions.dismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps an attachment-only draft open until closing is confirmed", async () => {
    let latest: ReturnType<typeof useMailCompose> | null = null;
    const closeActions = registerCloseHarness(null);

    await act(async () => {
      root.render(
        <MailComposeProvider mailServerLimits={fallbackMailServerLimits}>
          <ComposeProbe onReady={(value) => { latest = value; }} />
        </MailComposeProvider>,
      );
    });

    await act(async () => {
      latest!.setComposeAttachments([new File(["x"], "a.txt")]);
    });

    await act(async () => {
      latest!.requestComposeClose();
    });

    expect(closeActions.dismiss).not.toHaveBeenCalled();
    const action = toastDiscardAction(mockToast.error);
    expect(action?.label).toBe("Close anyway");
    action?.onClick();
    expect(closeActions.dismiss).toHaveBeenCalledTimes(1);
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

  it("treats an untouched reply as clean so closing it saves no draft", async () => {
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
      from: [{ email: "bob@solace.onl" }],
      to: [{ email: "alice@solace.onl" }],
      receivedAt: "2026-06-19T10:00:00.000Z",
      textBody: [{ partId: "1", type: "text/plain" }],
      bodyValues: { "1": { value: "Hello?" } },
    } as const;

    await act(async () => {
      getMailComposeBridge()?.seedReply(message as never, null);
    });

    expect(getMailComposeBridge()?.isComposeDirty()).toBe(false);
  });
});
