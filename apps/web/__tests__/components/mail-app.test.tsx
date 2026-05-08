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

// jsdom does not implement matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  }),
}));

jest.mock("@workspace/ui/components/ui/dropdown-menu", () => {
  const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const PassthroughAsButton = ({ children, asChild: _asChild, ...props }: any) => (
    <button {...props}>{children}</button>
  );
  return {
    DropdownMenu: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuItem: PassthroughAsButton,
    DropdownMenuTrigger: PassthroughAsButton,
  };
});

jest.mock("@workspace/ui/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("@workspace/ui/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

jest.mock("@workspace/ui/components/ui/app-skeletons", () => ({
  DashboardSkeleton: () => <div>Loading…</div>,
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    Inbox: Icon,
    Lock: Icon,
    MailPlus: Icon,
    Plus: Icon,
    RefreshCcw: Icon,
    ShieldCheck: Icon,
    Send: Icon,
    UserRoundPlus: Icon,
  };
});

jest.mock("../../lib/mail/api-service", () => ({
  mailDemoApiService: {
    getConfig: jest.fn(),
    getAccountStatus: jest.fn(),
    bootstrapAccountMailbox: jest.fn(),
    signUp: jest.fn(),
    getAccountVaultBackup: jest.fn(),
    getVaultBackup: jest.fn(),
    getRecipientKey: jest.fn(),
    upsertVaultBackup: jest.fn(),
    upsertAccountVaultBackup: jest.fn(),
  },
}));

jest.mock("../../lib/auth-client", () => ({
  useSession: jest.fn(),
}));

jest.mock("../../lib/e2ee-password-cache", () => ({
  peekCachedAuthPassword: jest.fn(),
}));

jest.mock("../../lib/enc-password-cookie", () => ({
  clearEncPasswordCookie: jest.fn(),
  initEncPasswordFromCookie: jest.fn(),
}));

jest.mock("postal-mime", () => ({
  default: { parse: jest.fn().mockResolvedValue({ text: "", html: null }) },
}));

jest.mock("../../lib/mail/vault-crypto", () => ({
  createEncryptedMailVault: jest.fn(),
  unlockEncryptedMailVault: jest.fn(),
}));

const mockJmapClient = {
  discoverSession: jest.fn<() => Promise<any>>(),
  getAccountSettings: jest.fn<() => Promise<any>>(),
  getMailboxes: jest.fn<() => Promise<any>>(),
  getMailboxMessages: jest.fn<() => Promise<any>>(),
  getIdentities: jest.fn<() => Promise<any>>(),
  sendMessage: jest.fn<() => Promise<any>>(),
  markAsRead: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  markAsUnread: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  moveToTrash: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  moveToMailbox: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  createMailbox: jest.fn<() => Promise<any>>(),
  deleteMailbox: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  updateMailboxSortOrders: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  getBlobAsText: jest.fn<() => Promise<any>>(),
  bulkMoveToTrash: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  bulkMoveToMailbox: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  bulkMarkAsUnread: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  bulkMarkAsRead: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
};

jest.mock("../../lib/mail/jmap-client", () => ({
  StalwartJmapClient: jest.fn(() => mockJmapClient),
}));

jest.mock("../../lib/mail/worker-client", () => ({
  mailCryptoWorkerClient: {
    generateKeyPair: jest.fn(),
    loadVault: jest.fn(),
    encryptForRecipients: jest.fn(),
    decryptMessage: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock("../../components/mail/mail-command-palette", () => ({
  MailCommandPalette: () => null,
}));

jest.mock("../../components/mail/mail-sidebar", () => ({
  MailSidebar: ({ activeMailbox, onSelectMailbox }: any) =>
    activeMailbox ? (
      <nav>
        {activeMailbox.mailboxes.map((m: any) => (
          <button key={m.id} onClick={() => onSelectMailbox(m.id)}>{m.name}</button>
        ))}
      </nav>
    ) : null,
}));

jest.mock("../../components/mail/message-list", () => ({
  MessageList: ({ messages }: { messages: { id: string; subject?: string }[] }) => (
    <ul>{messages.map((m) => <li key={m.id}>{m.subject}</li>)}</ul>
  ),
}));

jest.mock("../../components/mail/message-reader", () => ({
  MessageReader: () => null,
}));

jest.mock("../../components/mail/compose-dialog", () => ({
  ComposeDialog: ({ open, composeTo, composeSubject, composeBody, setComposeTo, setComposeSubject, setComposeBody, onSend }: any) =>
    open ? (
      <div>
        <input placeholder="Recipient" value={composeTo} onChange={(e: any) => setComposeTo(e.target.value)} />
        <input placeholder="Subject" value={composeSubject} onChange={(e: any) => setComposeSubject(e.target.value)} />
        <textarea value={composeBody} onChange={(e: any) => setComposeBody(e.target.value)} />
        <button onClick={() => void onSend()}>Send message</button>
      </div>
    ) : null,
}));

jest.mock("../../hooks/use-smooth-router", () => ({
  useSmoothRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
    refresh: jest.fn(),
    startRouteTransition: jest.fn(),
    finishRouteTransition: jest.fn(),
    isRouteTransitionActive: false,
  }),
}));

import { MailApp } from "../../components/mail/mail-app";
import { useSession } from "../../lib/auth-client";
import { peekCachedAuthPassword } from "../../lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  initEncPasswordFromCookie,
} from "../../lib/enc-password-cookie";
import { mailDemoApiService } from "../../lib/mail/api-service";
import {
  createEncryptedMailVault,
  unlockEncryptedMailVault,
} from "../../lib/mail/vault-crypto";
import { mailCryptoWorkerClient } from "../../lib/mail/worker-client";

const mockUseSession = jest.mocked(useSession);
const mockPeekCachedAuthPassword = jest.mocked(peekCachedAuthPassword);
const mockInitEncPasswordFromCookie = jest.mocked(initEncPasswordFromCookie);
const mockClearEncPasswordCookie = jest.mocked(clearEncPasswordCookie);
const mockApi = jest.mocked(mailDemoApiService);
const mockCreateEncryptedMailVault = jest.mocked(createEncryptedMailVault);
const mockUnlockEncryptedMailVault = jest.mocked(unlockEncryptedMailVault);
const mockWorkerClient = jest.mocked(mailCryptoWorkerClient);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );

    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function resetMailVaultDatabase() {
  if (typeof indexedDB === "undefined") {
    return;
  }

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("solace-mail");

    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

describe("MailApp", () => {
  beforeEach(async () => {
    await resetMailVaultDatabase();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: "user-1",
          email: "alice@solace.onl",
          name: "Alice Example",
        },
      },
      isPending: false,
    } as any);
    mockPeekCachedAuthPassword.mockReturnValue(null);
    mockInitEncPasswordFromCookie.mockResolvedValue(undefined);
    mockClearEncPasswordCookie.mockReset();

    mockApi.getConfig.mockResolvedValue({
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "http://192.168.2.213:8080",
      signupEnabled: true,
      loginMode: "basic",
    });
    mockApi.getAccountStatus.mockResolvedValue({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: true,
    });
    mockWorkerClient.generateKeyPair.mockResolvedValue({
      publicKeyArmored: "public-key-armored",
      privateKeyArmored: "private-key-armored",
      revocationCertificate: "revoke-cert",
      fingerprint: "ABCD1234EF567890",
    });
    mockCreateEncryptedMailVault.mockResolvedValue({
      encryptedVaultB64: "vault-b64",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
    });
    mockApi.bootstrapAccountMailbox.mockResolvedValue({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      fingerprint: "ABCD1234EF567890",
      encryptionAtRestEnabled: true,
    });

    mockApi.getAccountVaultBackup.mockResolvedValue({
      email: "alice@solace.onl",
      vaultVersion: 1,
      encryptedVaultB64: "vault-b64",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
    });
    mockUnlockEncryptedMailVault.mockResolvedValue({
      userId: "mail-user-1",
      email: "alice@solace.onl",
      publicKeyArmored: "public-key-armored",
      publicKeyFingerprint: "ABCD1234EF567890",
      encryptedPrivateKeyArmored: "private-key-armored",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
      vaultVersion: 1,
      createdAt: "2026-05-06T21:00:00.000Z",
    });
    mockWorkerClient.loadVault.mockResolvedValue({
      fingerprint: "ABCD1234EF567890",
    });
    mockJmapClient.discoverSession.mockResolvedValue({
      accounts: { b: { name: "alice@solace.onl" } },
      primaryAccounts: { "urn:ietf:params:jmap:mail": "b" },
      apiUrl: "http://192.168.2.213:8080/jmap/",
    });
    mockJmapClient.getAccountSettings.mockResolvedValue({
      encryptionAtRest: { "@type": "Aes256" },
    });
    mockJmapClient.getMailboxes.mockResolvedValue([
      { id: "inbox-1", name: "Inbox", role: "inbox" },
      { id: "drafts-1", name: "Drafts", role: "drafts" },
      { id: "junk-1", name: "Junk Mail", role: "junk" },
      { id: "sent-1", name: "Sent Items", role: "sent" },
    ]);
    mockJmapClient.getMailboxMessages.mockResolvedValue([
      {
        id: "mail-1",
        subject: "Encrypted hello",
        from: [{ email: "bob@solace.onl", name: "Bob" }],
        receivedAt: "2026-05-06T21:10:00.000Z",
        textBody: [{ partId: "text" }],
        bodyValues: { text: { value: "Hello Alice" } },
      },
    ]);
    mockJmapClient.getIdentities.mockResolvedValue([
      { id: "identity-1", email: "alice@solace.onl" },
    ]);
  });

  afterEach(async () => {
    act(() => {
      root.unmount();
    });
    container.remove();
    await resetMailVaultDatabase();
    jest.clearAllMocks();
  });

  async function renderApp() {
    await act(async () => {
      root.render(<MailApp />);
      await Promise.resolve();
    });
  }

  it("submits signup data after generating and wrapping the client key vault", async () => {
    mockApi.getAccountStatus.mockResolvedValueOnce({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: false,
    });

    await renderApp();

    const createMailboxButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent === "Create mailbox");

    await act(async () => {
      createMailboxButton?.click();
      await Promise.resolve();
    });

    setInputValue(
      container.querySelector("#signup-password") as HTMLInputElement,
      "StrongMailboxPassword!42",
    );
    setInputValue(
      container.querySelector(
        "#signup-password-confirm",
      ) as HTMLInputElement,
      "StrongMailboxPassword!42",
    );

    const submitButton = Array.from(container.querySelectorAll("button"))
      .filter((element) => element.textContent === "Create mailbox")
      .at(-1);

    await act(async () => {
      submitButton?.click();
      await Promise.resolve();
    });

    expect(mockWorkerClient.generateKeyPair).toHaveBeenCalledWith({
      name: "Alice Example",
      email: "alice@solace.onl",
      privateKeyPassphrase: "StrongMailboxPassword!42",
    });
    expect(mockCreateEncryptedMailVault).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alice@solace.onl",
        publicKeyArmored: "public-key-armored",
        encryptedPrivateKeyArmored: "private-key-armored",
      }),
      "StrongMailboxPassword!42",
    );
    expect(mockApi.bootstrapAccountMailbox).toHaveBeenCalledWith({
      password: "StrongMailboxPassword!42",
      publicKeyArmored: "public-key-armored",
      fingerprint: "ABCD1234EF567890",
      algorithm: "openpgp",
      createdAt: expect.any(String),
      vaultVersion: 1,
      encryptedVaultB64: "vault-b64",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
    });
  });

  it("signs in with JMAP credentials, unlocks the vault, and renders inbox messages", async () => {
    await renderApp();

    setInputValue(
      container.querySelector("#login-password") as HTMLInputElement,
      "StrongMailboxPassword!42",
    );

    const signInButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Open mailbox",
    );

    await act(async () => {
      signInButton?.click();
      await Promise.resolve();
    });

    expect(mockApi.getAccountVaultBackup).toHaveBeenCalled();
    expect(mockUnlockEncryptedMailVault).toHaveBeenCalledWith(
      "vault-b64",
      "StrongMailboxPassword!42",
      {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
    );
    expect(mockWorkerClient.loadVault).toHaveBeenCalledWith({
      privateKeyArmored: "private-key-armored",
      privateKeyPassphrase: "StrongMailboxPassword!42",
      publicKeyArmored: "public-key-armored",
    });
    expect(container.textContent).toContain("Encrypted hello");
    expect(container.textContent).toContain("Inbox");
  });

  it("automatically opens a provisioned mailbox when the auth password is still cached", async () => {
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");

    await renderApp();

    expect(mockApi.getAccountVaultBackup).toHaveBeenCalled();
    expect(mockUnlockEncryptedMailVault).toHaveBeenCalledWith(
      "vault-b64",
      "StrongMailboxPassword!42",
      {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
    );
    expect(container.textContent).toContain("Encrypted hello");
  });

  it("shows an auto-open status instead of the mailbox login form while opening with the cached auth password", async () => {
    let resolveUnlock: ((value: any) => void) | null = null;
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");
    mockUnlockEncryptedMailVault.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUnlock = resolve;
        }),
    );

    await act(async () => {
      root.render(<MailApp />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Opening your mailbox",
    );
    expect(container.textContent).not.toContain("Open mailbox");

    await act(async () => {
      resolveUnlock?.({
        userId: "mail-user-1",
        email: "alice@solace.onl",
        publicKeyArmored: "public-key-armored",
        publicKeyFingerprint: "ABCD1234EF567890",
        encryptedPrivateKeyArmored: "private-key-armored",
        kdf: "argon2id",
        kdfParams: {
          saltB64: "salt-b64",
          memoryKiB: 65536,
          iterations: 3,
          parallelism: 4,
        },
        vaultVersion: 1,
        createdAt: "2026-05-06T21:00:00.000Z",
      });
      await Promise.resolve();
    });
  });

  it("loads messages for the selected mailbox folder", async () => {
    mockJmapClient.getMailboxMessages.mockReset();
    mockJmapClient.getMailboxMessages
      .mockResolvedValueOnce([
        {
          id: "mail-1",
          subject: "Inbox hello",
          from: [{ email: "bob@solace.onl", name: "Bob" }],
          receivedAt: "2026-05-06T21:10:00.000Z",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Inbox body" } },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "mail-2",
          subject: "Junk hello",
          from: [{ email: "spam@example.com", name: "Spammer" }],
          receivedAt: "2026-05-06T21:11:00.000Z",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Junk body" } },
        },
      ]);

    await renderApp();

    setInputValue(
      container.querySelector("#login-password") as HTMLInputElement,
      "StrongMailboxPassword!42",
    );

    const signInButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Open mailbox",
    );

    await act(async () => {
      signInButton?.click();
      await Promise.resolve();
    });

    const junkButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Junk Mail"),
    );

    await act(async () => {
      junkButton?.click();
      await Promise.resolve();
    });

    expect(mockJmapClient.getMailboxMessages).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        apiUrl: "http://192.168.2.213:8080/jmap/",
      }),
      "junk-1",
    );
    expect(container.textContent).toContain("Junk hello");
  });

  it("sends plaintext mail without looking up recipient keys", async () => {
    mockJmapClient.getMailboxMessages.mockReset();
    mockJmapClient.getMailboxMessages.mockResolvedValue([
      {
        id: "mail-1",
        subject: "Encrypted hello",
        from: [{ email: "bob@solace.onl", name: "Bob" }],
        receivedAt: "2026-05-06T21:10:00.000Z",
        textBody: [{ partId: "text" }],
        bodyValues: { text: { value: "Hello Alice" } },
      },
    ]);

    await renderApp();

    setInputValue(
      container.querySelector("#login-password") as HTMLInputElement,
      "StrongMailboxPassword!42",
    );

    const signInButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Open mailbox",
    );

    await act(async () => {
      signInButton?.click();
      await Promise.resolve();
    });

    const composeButton = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.includes("Compose"),
    );
    await act(async () => {
      composeButton?.click();
      await Promise.resolve();
    });

    setInputValue(
      container.querySelector('input[placeholder="Recipient"]') as HTMLInputElement,
      "iiroan@proton.me",
    );
    setInputValue(
      container.querySelector('input[placeholder="Subject"]') as HTMLInputElement,
      "Hello",
    );
    act(() => {
      const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      );

      descriptor?.set?.call(textarea, "Plaintext body");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const sendButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Send message",
    );

    await act(async () => {
      sendButton?.click();
      await Promise.resolve();
    });

    expect(mockApi.getRecipientKey).not.toHaveBeenCalled();
    expect(mockWorkerClient.encryptForRecipients).not.toHaveBeenCalled();
    expect(mockJmapClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "http://192.168.2.213:8080/jmap/",
      }),
      {
        draftsMailboxId: "drafts-1",
        sentMailboxId: "sent-1",
        fromEmail: "alice@solace.onl",
        to: ["iiroan@proton.me"],
        subject: "Hello",
        textBody: "Plaintext body",
        identityId: "identity-1",
      },
    );
    // After sending, the hook refreshes the active mailbox messages
    expect(mockJmapClient.getMailboxMessages).toHaveBeenCalledTimes(2);
  });

  it("calls initEncPasswordFromCookie on mount", async () => {
    await renderApp();
    expect(mockInitEncPasswordFromCookie).toHaveBeenCalled();
  });

  it("auto-opens the mailbox when the encrypted cookie restores the password after mount", async () => {
    let resolveCookieInit: (() => void) | null = null;
    mockInitEncPasswordFromCookie.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCookieInit = () => {
            mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");
            resolve();
          };
        }),
    );

    await act(async () => {
      root.render(<MailApp />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Before cookie init resolves: password field should still be visible
    expect(container.textContent).toContain("Open mailbox");

    await act(async () => {
      resolveCookieInit?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockUnlockEncryptedMailVault).toHaveBeenCalledWith(
      "vault-b64",
      "StrongMailboxPassword!42",
      expect.any(Object),
    );
    expect(container.textContent).toContain("Encrypted hello");
  });
});