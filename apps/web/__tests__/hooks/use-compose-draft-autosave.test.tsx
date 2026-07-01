/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import {
  MailComposeProvider,
  useMailCompose,
  useMailComposeChrome,
} from "@/components/mail/mail-compose-context";
import { resolveMailServerLimits } from "@workspace/calendar-core";
import { useComposeDraftAutosave } from "@/hooks/use-compose-draft-autosave";
import type { JmapSession } from "@/lib/mail/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const saveDraft = jest.fn(async () => "draft-2");
const fallbackMailServerLimits = resolveMailServerLimits({});

function AutosaveProbe({
  onReady,
}: {
  onReady: (value: ReturnType<typeof useComposeDraftAutosave>) => void;
}) {
  const compose = useMailCompose();
  const autosave = useComposeDraftAutosave({
    client: {
      saveDraft,
    } as never,
    session: { apiUrl: "https://mail.example.com/jmap/" } as JmapSession,
    mailboxes: [{ id: "drafts-1", role: "drafts" }],
    identities: [{ id: "identity-1", email: "alice@solace.onl", name: "Alice" }],
    fallbackFromEmail: "alice@solace.onl",
    enabled: true,
  });

  React.useEffect(() => {
    onReady(autosave);
  }, [autosave, onReady]);

  return (
    <div>
      <span data-testid="to">{compose.composeTo}</span>
      <span data-testid="status">{compose.draftSaveStatus}</span>
    </div>
  );
}

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

describe("useComposeDraftAutosave", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    saveDraft.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    jest.useRealTimers();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("debounces draft saves while compose is open", async () => {
    let compose: ReturnType<typeof useMailCompose> | null = null;
    let chrome: ReturnType<typeof useMailComposeChrome> | null = null;

    await act(async () => {
      root.render(
        <MailComposeProvider
          identities={[
            { id: "identity-1", email: "alice@solace.onl", name: "Alice" },
          ]}
          mailServerLimits={fallbackMailServerLimits}
        >
          <ChromeProbe onReady={(value) => { chrome = value; }} />
          <ComposeProbe onReady={(value) => { compose = value; }} />
          <AutosaveProbe onReady={() => {}} />
        </MailComposeProvider>,
      );
    });

    expect(compose).not.toBeNull();
    expect(chrome).not.toBeNull();
    expect(saveDraft).not.toHaveBeenCalled();

    await act(async () => {
      chrome!.setIsComposeOpen(true);
      compose!.setComposeTo("bob@example.com");
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ apiUrl: "https://mail.example.com/jmap/" }),
      expect.objectContaining({
        draftsMailboxId: "drafts-1",
        fromEmail: "alice@solace.onl",
        fromName: "Alice",
        subject: "(No subject)",
      }),
    );
  });
});
