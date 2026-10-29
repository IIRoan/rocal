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
import type { JmapSession, UserKeyVault } from "@/lib/mail/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const saveDraft = jest.fn(
  async (_session: JmapSession, _input: Record<string, unknown>) => "draft-2",
);
const uploadTextBlob = jest.fn(async () => ({
  blobId: "sealed-draft",
  size: 128,
  type: "text/plain",
}));
const mockEncryptForRecipients = jest.fn(
  async (_input: { plaintext: string; recipientPublicKeysArmored: string[] }) => ({
    armoredMessage: "-----BEGIN PGP MESSAGE-----\nsealed\n-----END PGP MESSAGE-----",
  }),
);
jest.mock("@/lib/mail/worker-client", () => ({
  mailCryptoWorkerClient: {
    encryptForRecipients: (input: {
      plaintext: string;
      recipientPublicKeysArmored: string[];
    }) => mockEncryptForRecipients(input),
  },
}));
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
      uploadTextBlob,
    } as never,
    session: { apiUrl: "https://mail.example.com/jmap/" } as JmapSession,
    unlockedVault: { publicKeyArmored: "alice-public-key" } as UserKeyVault,
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
    uploadTextBlob.mockClear();
    mockEncryptForRecipients.mockClear();
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
          quoteDateOptions={{ timeFormat: "24h" }}
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
        ciphertext: { blobId: "sealed-draft", size: 128, type: "text/plain" },
      }),
    );
    const saved = saveDraft.mock.calls[0]?.[1];
    expect(saved).not.toHaveProperty("textBody");
    expect(saved).not.toHaveProperty("htmlBody");
    expect(mockEncryptForRecipients).toHaveBeenCalledWith({
      plaintext: expect.stringContaining("Content-Type: text/plain"),
      recipientPublicKeysArmored: ["alice-public-key"],
    });
    expect(uploadTextBlob).toHaveBeenCalledWith(
      expect.objectContaining({ apiUrl: "https://mail.example.com/jmap/" }),
      "-----BEGIN PGP MESSAGE-----\nsealed\n-----END PGP MESSAGE-----",
      "text/plain",
    );
  });
});
