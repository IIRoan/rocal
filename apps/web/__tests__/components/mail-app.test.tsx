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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockToggleSidebar = jest.fn();
const mockUseIsMobile = jest.fn(() => false);

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

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), {
    error: jest.fn(),
  }),
}));

jest.mock("@workspace/ui/components/ui/dropdown-menu", () => {
  const Passthrough = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  );
  const PassthroughAsButton = ({
    children,
    asChild: _asChild,
    ...props
  }: any) => <button {...props}>{children}</button>;
  return {
    DropdownMenu: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuItem: PassthroughAsButton,
    DropdownMenuTrigger: PassthroughAsButton,
  };
});

jest.mock("@workspace/ui/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useSidebar: () => ({
    toggleSidebar: mockToggleSidebar,
  }),
}));

jest.mock("@workspace/ui/components/ui", () => ({
  PageLoadingOverlay: ({ isLoading }: { isLoading?: boolean }) =>
    isLoading ? <div>Loading…</div> : null,
  AppLoadingState: ({ text }: { text?: string }) => (
    <div>{text ?? "Loading..."}</div>
  ),
}));

jest.mock("@workspace/ui/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

jest.mock("@workspace/ui/hooks", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

jest.mock("@workspace/ui/components/ui/app-skeletons", () => ({
  DashboardSkeleton: () => <div>Loading…</div>,
  MailSkeleton: () => <div>Loading…</div>,
  MailContentSkeleton: () => <div>Loading…</div>,
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    ArrowLeft: Icon,
    ChevronRight: Icon,
    Ellipsis: Icon,
    Inbox: Icon,
    Loader2: Icon,
    Lock: Icon,
    MailPlus: Icon,
    Menu: Icon,
    Pencil: Icon,
    Plus: Icon,
    RefreshCcw: Icon,
    RotateCcw: Icon,
    Search: Icon,
    Send: Icon,
    ShieldCheck: Icon,
    UserRoundPlus: Icon,
    X: Icon,
  };
});

jest.mock("../../lib/mail/api-service", () => ({
  mailDemoApiService: {
    getConfig: jest.fn(),
    getAccountStatus: jest.fn(),
    bootstrapAccountMailbox: jest.fn(),
    getAccountVaultBackup: jest.fn(),
    getVaultKeyMaterial: jest.fn(),
    getVaultBackup: jest.fn(),
    getRecipientKey: jest.fn(),
    upsertVaultBackup: jest.fn(),
    upsertAccountVaultBackup: jest.fn(),
    syncAccount: jest.fn(),
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
  default: {
    parse: (jest.fn() as any).mockResolvedValue({ text: "", html: null }),
  },
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
  getThreadMessages: jest.fn<() => Promise<any>>(),
  getIdentities: jest.fn<() => Promise<any>>(),
  sendMessage: jest.fn<() => Promise<any>>(),
  markAsRead: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  markAsUnread: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  moveToTrash: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  moveToMailbox: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  createMailbox: jest.fn<() => Promise<any>>(),
  deleteMailbox: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  updateMailboxSortOrders: jest
    .fn<() => Promise<any>>()
    .mockResolvedValue(undefined),
  getBlobAsText: jest.fn<() => Promise<any>>(),
  bulkMoveToTrash: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  bulkMoveToMailbox: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  bulkMarkAsUnread: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  bulkMarkAsRead: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
};

jest.mock("../../lib/mail/jmap-client", () => ({
  StalwartJmapClient: jest.fn(() => mockJmapClient),
  getPrimaryMailAccountId: jest.fn(
    (session: {
      primaryAccounts?: Record<string, string>;
      accounts?: Record<string, unknown>;
    }) =>
      session.primaryAccounts?.["urn:ietf:params:jmap:mail"] ??
      Object.keys(session.accounts ?? {})[0] ??
      null,
  ),
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

jest.mock("../../hooks/use-settings", () => ({
  useSettings: () => ({
    settings: { timeFormat: "24h" },
    updateSettings: jest.fn(),
  }),
}));

jest.mock("../../components/mail/mail-sidebar", () => ({
  MailSidebar: ({ activeMailbox, onSelectMailbox, onCompose }: any) =>
    activeMailbox ? (
      <nav>
        {activeMailbox.mailboxes.map((m: any) => (
          <button key={m.id} onClick={() => onSelectMailbox(m.id)}>
            {m.name}
          </button>
        ))}
        <button onClick={onCompose} aria-label="Compose">
          Compose
        </button>
      </nav>
    ) : null,
}));

jest.mock("../../components/mail/message-list", () => ({
  MessageList: ({
    messages,
    onSelect,
  }: {
    messages: { id: string; subject?: string }[];
    onSelect?: (id: string) => void;
  }) => (
    <ul>
      {messages.map((m) => (
        <li key={m.id}>
          <button type="button" onClick={() => onSelect?.(m.id)}>
            {m.subject}
          </button>
        </li>
      ))}
    </ul>
  ),
}));

jest.mock("../../components/mail/message-reader", () => ({
  MessageReader: ({
    message,
    conversationMessages = [],
    onReply,
    onSendReply,
  }: any) =>
    message ? (
      <div>
        <div>{message.subject}</div>
        <ul data-testid="conversation-strip">
          {conversationMessages.map((entry: any) => (
            <li key={entry.id}>
              {entry.from?.[0]?.email ?? "unknown"}|{entry.subject ?? ""}|
              {entry.bodyValues?.text?.value ?? ""}
            </li>
          ))}
        </ul>
        <button type="button" aria-label="Reply" onClick={onReply}>
          Reply
        </button>
        <button type="button" onClick={() => void onSendReply?.("Thanks!", [])}>
          Send reply
        </button>
      </div>
    ) : null,
}));

jest.mock("../../components/mobile-app-switcher", () => ({
  MobileAppSwitcher: () => <div>App switcher</div>,
}));

jest.mock("../../components/mail/attachment-preview-dialog", () => ({
  AttachmentPreviewDialog: () => null,
}));

jest.mock("../../components/mail/compose-dialog", () => {
  const React = require("react");
  const {
    useMailCompose,
    useMailComposeChrome,
  } = require("../../components/mail/mail-compose-context");

  function ComposeFields({
    onSend,
    onExpand,
  }: {
    onSend: () => Promise<void>;
    onExpand?: () => void;
  }) {
    const {
      composeTo,
      composeSubject,
      composeBody,
      setComposeTo,
      setComposeSubject,
      setComposeBody,
    } = useMailCompose();

    return (
      <div>
        <input
          placeholder="Recipient"
          value={composeTo}
          onChange={(e: any) => setComposeTo(e.target.value)}
        />
        <input
          placeholder="Subject"
          value={composeSubject}
          onChange={(e: any) => setComposeSubject(e.target.value)}
        />
        <textarea
          value={composeBody}
          onChange={(e: any) => setComposeBody(e.target.value)}
        />
        {onExpand ? (
          <button onClick={onExpand}>Expand compose</button>
        ) : null}
        <button onClick={() => void onSend()}>Send message</button>
      </div>
    );
  }

  return {
    ComposeForm: ({ onSend }: any) => <ComposeFields onSend={onSend} />,
    ComposeDialog: ({ onSend, onExpand }: any) => {
      const { isComposeOpen } = useMailComposeChrome();
      return isComposeOpen ? (
        <ComposeFields onSend={onSend} onExpand={onExpand} />
      ) : null;
    },
  };
});

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
import { toast } from "sonner";

const mockToast = jest.mocked(toast);
const mockUseSession = jest.mocked(useSession);
const mockPeekCachedAuthPassword = jest.mocked(peekCachedAuthPassword);
const mockInitEncPasswordFromCookie = jest.mocked(initEncPasswordFromCookie);
const mockClearEncPasswordCookie = jest.mocked(clearEncPasswordCookie);
const mockApi = jest.mocked(mailDemoApiService);
const mockCreateEncryptedMailVault = jest.mocked(createEncryptedMailVault);
const mockUnlockEncryptedMailVault = jest.mocked(unlockEncryptedMailVault);
const mockWorkerClient = jest.mocked(mailCryptoWorkerClient);
const mockToastError = jest.mocked(toast.error);

const mockMailOAuthConfig = {
  issuer: "https://api.solace.test/api/auth",
  discoveryUrl: "https://api.solace.test/api/.well-known/openid-configuration",
  authorizationEndpoint: "https://api.solace.test/api/auth/oauth2/authorize",
  tokenEndpoint: "https://api.solace.test/api/auth/oauth2/token",
  userinfoEndpoint: "https://api.solace.test/api/auth/oauth2/userinfo",
  jwksUri: "https://api.solace.test/api/auth/jwks",
  mailTokenEndpoint: "https://api.solace.test/api/mail/oauth/access-token",
  clientId: "solace-mail-browser",
  redirectUri: "https://app.solace.test/mail/oauth/callback",
  scopes: ["openid", "email"],
  audiences: ["https://mail.solace.onl"],
};

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

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

async function waitForExpectation(
  assertion: () => void,
  timeoutMs: number = 1500,
) {
  const startedAt = Date.now();

  const retry = async (): Promise<void> => {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });

      return retry();
    }
  };

  return retry();
}

describe("MailApp", () => {
  beforeEach(async () => {
    await resetMailVaultDatabase();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    mockToast.mockReset();
    mockToastError.mockReset();
    mockToggleSidebar.mockReset();
    mockUseIsMobile.mockReturnValue(false);

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
      oauth: mockMailOAuthConfig,
      vaultKeyMaterialEndpoint: "https://api.solace.test/api/mail/vault-key-material",
    });
    mockApi.getAccountStatus.mockResolvedValue({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: true,
    });
    mockApi.getVaultKeyMaterial.mockResolvedValue({
      keyMaterial: "server-derived-key-material",
      version: "v1",
    });
    mockApi.getRecipientKey.mockResolvedValue({
      email: "bob@solace.onl",
      publicKeyArmored: "bob-public-key",
      fingerprint: "FACECAFE12345678",
      source: "internal",
      trust: "verified",
    });
    mockApi.syncAccount.mockResolvedValue({
      accountId: "b",
      initialized: false,
      changedTypes: [],
      email: {
        oldState: "email-old",
        newState: "email-new",
        created: [],
        updated: [],
        destroyed: [],
        records: [],
      },
      mailbox: {
        oldState: "mailbox-old",
        newState: "mailbox-new",
        created: [],
        updated: [],
        destroyed: [],
        records: [],
      },
      thread: {
        oldState: "thread-old",
        newState: "thread-new",
        created: [],
        updated: [],
        destroyed: [],
        records: [],
      },
    } as any);
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
    mockWorkerClient.encryptForRecipients.mockResolvedValue({
      armoredMessage:
        "-----BEGIN PGP MESSAGE-----\nVersion: OpenPGP\n\nciphertext\n-----END PGP MESSAGE-----",
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
    mockJmapClient.getMailboxMessages.mockResolvedValue({
      messages: [
        {
          id: "mail-1",
          subject: "Encrypted hello",
          from: [{ email: "bob@solace.onl", name: "Bob" }],
          receivedAt: "2026-05-06T21:10:00.000Z",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Hello Alice" } },
        },
      ],
      total: 1,
    });
    mockJmapClient.getThreadMessages.mockResolvedValue([
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
      root.render(
        <QueryClientProvider client={queryClient}>
          <MailApp />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  }

  it("auto-provisions and opens the mailbox on first visit using the cached auth password", async () => {
    mockApi.getAccountStatus.mockResolvedValueOnce({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: false,
    });
    mockApi.getVaultKeyMaterial.mockRejectedValueOnce(new Error("no key"));
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");

    await renderApp();

    await waitForExpectation(() => {
      expect(mockWorkerClient.generateKeyPair).toHaveBeenCalledWith({
        name: "Alice Example",
        email: "alice@solace.onl",
        privateKeyPassphrase: "StrongMailboxPassword!42",
      });
    });
    expect(mockCreateEncryptedMailVault).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alice@solace.onl",
        publicKeyArmored: "public-key-armored",
        encryptedPrivateKeyArmored: "private-key-armored",
      }),
      "StrongMailboxPassword!42",
      undefined,
    );
    expect(mockApi.bootstrapAccountMailbox).toHaveBeenCalledWith({
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
    expect(
      mockApi.bootstrapAccountMailbox.mock.calls[0]?.[0],
    ).not.toHaveProperty("password");
    expect(mockApi.bootstrapAccountMailbox).toHaveBeenCalledTimes(1);
    expect(mockApi.getAccountVaultBackup).toHaveBeenCalledTimes(1);
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

  it("retries a transient auto-provision failure without surfacing a mailbox error", async () => {
    mockApi.getAccountStatus.mockResolvedValueOnce({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: false,
    });
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");
    mockApi.bootstrapAccountMailbox
      .mockRejectedValueOnce({
        statusCode: 500,
        message: "Mail API request failed with status 500.",
      })
      .mockResolvedValueOnce({
        email: "alice@solace.onl",
        displayName: "Alice Example",
        stalwartAccountId: "acct-1",
        stalwartPublicKeyId: "pk-1",
        fingerprint: "ABCD1234EF567890",
        encryptionAtRestEnabled: true,
      });

    await renderApp();
    await waitForExpectation(() => {
      expect(mockApi.bootstrapAccountMailbox).toHaveBeenCalledTimes(2);
    });
    await waitForExpectation(() => {
      expect(mockApi.getAccountVaultBackup).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain("Encrypted hello");
    });
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("does not prompt for a mailbox password when automatic migration prerequisites are missing", async () => {
    mockApi.getAccountStatus.mockResolvedValueOnce({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: false,
    });
    mockApi.getVaultKeyMaterial.mockRejectedValueOnce(new Error("no key"));

    await renderApp();

    await waitForExpectation(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "This mailbox still needs a one-time password migration. Sign out and sign back in with your email password once to finish automatic unlocking.",
      );
    });
    expect(container.textContent).not.toContain("One-time mailbox migration");
    expect(mockApi.bootstrapAccountMailbox).not.toHaveBeenCalled();
  });

  it("signs in with JMAP credentials, unlocks the vault, and renders inbox messages", async () => {
    mockApi.getVaultKeyMaterial.mockRejectedValueOnce(new Error("no key"));
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
    expect(mockWorkerClient.loadVault).toHaveBeenCalledWith({
      privateKeyArmored: "private-key-armored",
      privateKeyPassphrase: "StrongMailboxPassword!42",
      publicKeyArmored: "public-key-armored",
    });
    expect(container.textContent).toContain("Encrypted hello");
    expect(container.textContent).toContain("Inbox");
  });

  it("automatically opens a provisioned mailbox when the auth password is still cached", async () => {
    mockApi.getVaultKeyMaterial.mockRejectedValueOnce(new Error("no key"));
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");

    await renderApp();

    await waitForExpectation(() => {
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
    });
    expect(container.textContent).toContain("Encrypted hello");
  });

  it("does not auto-open the newest message on desktop", async () => {
    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    expect(container.querySelector('button[aria-label="Reply"]')).toBeNull();
  });

  it("does not auto-open the newest message on mobile", async () => {
    mockUseIsMobile.mockReturnValue(true);

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    expect(container.querySelector('button[aria-label="Reply"]')).toBeNull();
  });

  it("shows the loading skeleton instead of the migration prompt while auto-opening with the cached auth password", async () => {
    let resolveUnlock: ((value: any) => void) | null = null;
    mockApi.getVaultKeyMaterial.mockRejectedValueOnce(new Error("no key"));
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");
    mockUnlockEncryptedMailVault.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUnlock = resolve;
        }),
    );

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MailApp />
        </QueryClientProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Loading…");
      expect(container.textContent).not.toContain("Migrate mailbox");
    });
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
    mockApi.getVaultKeyMaterial.mockRejectedValueOnce(new Error("no key"));
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");
    mockJmapClient.getMailboxMessages.mockReset();
    mockJmapClient.getMailboxMessages.mockImplementation(
      async (...args: any[]) => {
        const mailboxId = args[1] as string;
        if (mailboxId === "junk-1") {
          return {
            messages: [
              {
                id: "mail-2",
                subject: "Junk hello",
                from: [{ email: "spam@example.com", name: "Spammer" }],
                receivedAt: "2026-05-06T21:11:00.000Z",
                textBody: [{ partId: "text" }],
                bodyValues: { text: { value: "Junk body" } },
              },
            ],
            total: 1,
          };
        }

        return {
          messages: [
            {
              id: "mail-1",
              subject: "Inbox hello",
              from: [{ email: "bob@solace.onl", name: "Bob" }],
              receivedAt: "2026-05-06T21:10:00.000Z",
              textBody: [{ partId: "text" }],
              bodyValues: { text: { value: "Inbox body" } },
            },
          ],
          total: 1,
        };
      },
    );

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Inbox hello");
    });

    const junkButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Junk Mail"),
    );

    await act(async () => {
      junkButton?.click();
      await Promise.resolve();
    });

    expect(mockJmapClient.getMailboxMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "http://192.168.2.213:8080/jmap/",
      }),
      "junk-1",
      expect.objectContaining({ limit: 20, position: 0 }),
    );
    expect(container.textContent).toContain("Junk hello");
  });

  it("sends plaintext mail without looking up recipient keys", async () => {
    mockApi.getVaultKeyMaterial.mockRejectedValueOnce(new Error("no key"));
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");
    mockJmapClient.getMailboxMessages.mockReset();
    mockJmapClient.getMailboxMessages.mockResolvedValue({
      messages: [
        {
          id: "mail-1",
          subject: "Encrypted hello",
          from: [{ email: "bob@solace.onl", name: "Bob" }],
          receivedAt: "2026-05-06T21:10:00.000Z",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Hello Alice" } },
        },
      ],
      total: 1,
    });

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const composeButton = container.querySelector('[aria-label="Compose"]') as HTMLButtonElement | null;
    await act(async () => {
      composeButton?.click();
      await Promise.resolve();
    });

    setInputValue(
      container.querySelector(
        'input[placeholder="Recipient"]',
      ) as HTMLInputElement,
      "iiroan@proton.me",
    );
    setInputValue(
      container.querySelector(
        'input[placeholder="Subject"]',
      ) as HTMLInputElement,
      "Hello",
    );
    act(() => {
      const textarea = container.querySelector(
        "textarea",
      ) as HTMLTextAreaElement;
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

    await waitForExpectation(() => {
      expect(mockJmapClient.getMailboxMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: "http://192.168.2.213:8080/jmap/",
        }),
        "inbox-1",
        expect.objectContaining({ limit: 20 }),
      );
    });

    expect(mockApi.getRecipientKey).not.toHaveBeenCalled();
    expect(mockWorkerClient.encryptForRecipients).not.toHaveBeenCalled();
    expect(mockJmapClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "http://192.168.2.213:8080/jmap/",
      }),
      expect.objectContaining({
        draftsMailboxId: "drafts-1",
        sentMailboxId: "sent-1",
        fromEmail: "alice@solace.onl",
        to: ["iiroan@proton.me"],
        subject: "Hello",
        textBody: "Plaintext body",
        identityId: "identity-1",
      }),
    );
  });

  it("shows the mobile app switcher and opens mailbox navigation on mobile", async () => {
    mockUseIsMobile.mockReturnValue(true);

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("App switcher");
    });

    const mailboxButton = container.querySelector(
      'button[aria-label="Open mailboxes"]',
    ) as HTMLButtonElement | null;
    const composeButton = container.querySelector(
      'button[aria-label="Compose message"]',
    ) as HTMLButtonElement | null;

    expect(mailboxButton).not.toBeNull();
    expect(composeButton).not.toBeNull();

    act(() => {
      mailboxButton?.click();
    });

    expect(mockToggleSidebar).toHaveBeenCalledTimes(1);

    act(() => {
      composeButton?.click();
    });

    await waitForExpectation(() => {
      expect(container.querySelector('input[placeholder="Recipient"]')).not.toBe(
        null,
      );
    });
  });

  it("hands mobile full compose to the composer instead of keeping the mobile chrome visible", async () => {
    mockUseIsMobile.mockReturnValue(true);

    await renderApp();

    const composeButton = container.querySelector(
      'button[aria-label="Compose message"]',
    ) as HTMLButtonElement | null;

    act(() => {
      composeButton?.click();
    });

    const expandButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Expand compose",
    );

    act(() => {
      expandButton?.click();
    });

    await waitForExpectation(() => {
      expect(container.querySelector('input[placeholder="Recipient"]')).not.toBe(
        null,
      );
    });

    expect(container.textContent).not.toContain("App switcher");
  });

  it("encrypts internal mail before sending it through the JMAP proxy", async () => {
    mockApi.getVaultKeyMaterial.mockRejectedValueOnce(new Error("no key"));
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");
    mockJmapClient.getMailboxMessages.mockReset();
    mockJmapClient.getMailboxMessages.mockResolvedValue({
      messages: [
        {
          id: "mail-1",
          subject: "Encrypted hello",
          from: [{ email: "bob@solace.onl", name: "Bob" }],
          receivedAt: "2026-05-06T21:10:00.000Z",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Hello Alice" } },
        },
      ],
      total: 1,
    });

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const composeButton = container.querySelector('[aria-label="Compose"]') as HTMLButtonElement | null;
    await act(async () => {
      composeButton?.click();
      await Promise.resolve();
    });

    setInputValue(
      container.querySelector(
        'input[placeholder="Recipient"]',
      ) as HTMLInputElement,
      "bob@solace.onl",
    );
    setInputValue(
      container.querySelector(
        'input[placeholder="Subject"]',
      ) as HTMLInputElement,
      "Hello",
    );
    act(() => {
      const textarea = container.querySelector(
        "textarea",
      ) as HTMLTextAreaElement;
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      );

      descriptor?.set?.call(textarea, "Secret body");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const sendButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Send message",
    );

    await act(async () => {
      sendButton?.click();
      await Promise.resolve();
    });

    expect(mockApi.getRecipientKey).toHaveBeenCalledWith("bob@solace.onl");
    expect(mockWorkerClient.encryptForRecipients).toHaveBeenCalledWith({
      plaintext: "Secret body",
      recipientPublicKeysArmored: expect.arrayContaining([
        "public-key-armored",
        "bob-public-key",
      ]),
    });
    expect(mockJmapClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "http://192.168.2.213:8080/jmap/",
      }),
      expect.objectContaining({
        draftsMailboxId: "drafts-1",
        sentMailboxId: "sent-1",
        fromEmail: "alice@solace.onl",
        to: ["bob@solace.onl"],
        subject: "Hello",
        textBody:
          "-----BEGIN PGP MESSAGE-----\nVersion: OpenPGP\n\nciphertext\n-----END PGP MESSAGE-----",
        identityId: "identity-1",
      }),
    );
  });

  it("adds a sent quick reply into the active conversation immediately", async () => {
    mockApi.getVaultKeyMaterial.mockRejectedValueOnce(new Error("no key"));
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");
    mockJmapClient.getMailboxMessages.mockResolvedValue({
      messages: [
        {
          id: "mail-1",
          threadId: "thread-1",
          messageId: ["<mail-1@example.com>"],
          subject: "Encrypted hello",
          from: [{ email: "bob@solace.onl", name: "Bob" }],
          to: [{ email: "alice@solace.onl", name: "Alice" }],
          receivedAt: "2026-05-06T21:10:00.000Z",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Hello Alice" } },
        },
      ],
      total: 1,
    });
    mockJmapClient.getThreadMessages.mockResolvedValue([
      {
        id: "mail-1",
        threadId: "thread-1",
        messageId: ["<mail-1@example.com>"],
        subject: "Encrypted hello",
        from: [{ email: "bob@solace.onl", name: "Bob" }],
        to: [{ email: "alice@solace.onl", name: "Alice" }],
        receivedAt: "2026-05-06T21:10:00.000Z",
        textBody: [{ partId: "text" }],
        bodyValues: { text: { value: "Hello Alice" } },
      },
    ]);

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const messageButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Encrypted hello",
    );

    await act(async () => {
      messageButton?.click();
      await Promise.resolve();
    });

    const quickReplyButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Send reply",
    );

    await act(async () => {
      quickReplyButton?.click();
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(container.textContent).toContain("alice@solace.onl|Re: Encrypted hello|Thanks!");
    });
  });

  it("adds a sent compose reply into the active conversation immediately", async () => {
    mockApi.getVaultKeyMaterial.mockRejectedValueOnce(new Error("no key"));
    mockPeekCachedAuthPassword.mockReturnValue("StrongMailboxPassword!42");
    mockJmapClient.getMailboxMessages.mockResolvedValue({
      messages: [
        {
          id: "mail-1",
          threadId: "thread-1",
          messageId: ["<mail-1@example.com>"],
          subject: "Encrypted hello",
          from: [{ email: "bob@solace.onl", name: "Bob" }],
          to: [{ email: "alice@solace.onl", name: "Alice" }],
          receivedAt: "2026-05-06T21:10:00.000Z",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Hello Alice" } },
        },
      ],
      total: 1,
    });
    mockJmapClient.getThreadMessages.mockResolvedValue([
      {
        id: "mail-1",
        threadId: "thread-1",
        messageId: ["<mail-1@example.com>"],
        subject: "Encrypted hello",
        from: [{ email: "bob@solace.onl", name: "Bob" }],
        to: [{ email: "alice@solace.onl", name: "Alice" }],
        receivedAt: "2026-05-06T21:10:00.000Z",
        textBody: [{ partId: "text" }],
        bodyValues: { text: { value: "Hello Alice" } },
      },
    ]);

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const messageButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Encrypted hello",
    );

    await act(async () => {
      messageButton?.click();
      await Promise.resolve();
    });

    const replyButton = container.querySelector(
      'button[aria-label="Reply"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      replyButton?.click();
      await Promise.resolve();
    });

    act(() => {
      const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      );

      descriptor?.set?.call(textarea, "Compose reply body");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const sendButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Send message",
    );

    await act(async () => {
      sendButton?.click();
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(container.textContent).toContain(
        "alice@solace.onl|Re: Encrypted hello|Compose reply body",
      );
    });
  });

  it("calls initEncPasswordFromCookie on mount", async () => {
    await renderApp();
    expect(mockInitEncPasswordFromCookie).toHaveBeenCalled();
  });

  it("auto-opens the mailbox when the encrypted cookie restores the password after mount", async () => {
    let resolveCookieInit: (() => void) | null = null;
    mockApi.getVaultKeyMaterial.mockRejectedValue(new Error("no key"));
    mockInitEncPasswordFromCookie.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCookieInit = () => {
            mockPeekCachedAuthPassword.mockReturnValue(
              "StrongMailboxPassword!42",
            );
            resolve();
          };
        }),
    );

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MailApp />
        </QueryClientProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

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
