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
import type { StalwartJmapClient } from "../../lib/mail/jmap-client";

const mockToggleSidebar = jest.fn();
let mockComposeAttachmentFiles: File[] = [];
let mockQuickReplyFiles: File[] = [];
let mockAuthNavigationPending = false;
const mockUseIsMobile = jest.fn(() => false);
const mockUseSmoothRouter =
  jest.fn<typeof import("../../hooks/use-smooth-router").useSmoothRouter>();
const mockNextRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  prefetch: jest.fn(),
  refresh: jest.fn(),
};

jest.mock("next/navigation", () => ({
  useRouter: () => mockNextRouter,
  usePathname: () => globalThis.window.location.pathname,
  useSearchParams: () => new URLSearchParams(globalThis.window.location.search),
}));

jest.mock("@/lib/auth-navigation", () => ({
  completeAuthNavigation: jest.fn(),
  isAuthNavigationPending: () => mockAuthNavigationPending,
  beginAuthNavigation: (href: string) => {
    if (mockAuthNavigationPending) return null;
    mockAuthNavigationPending = true;
    return () => mockCompleteAuthNavigation(href);
  },
}));

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
    debug: jest.fn(),
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
  const PassthroughAsButton = ({ children, asChild, ...props }: any) =>
    asChild ? children : <button {...props}>{children}</button>;
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
  usePrefersReducedMotion: () => true,
  usePaintedValue: jest.requireActual<typeof import("@workspace/ui/hooks")>(
    "@workspace/ui/hooks",
  ).usePaintedValue,
}));

jest.mock("@workspace/ui/components/ui/app-skeletons", () => ({
  DashboardSkeleton: () => <div>Loading…</div>,
  MailSkeleton: () => <div>Loading…</div>,
  MailContentSkeleton: () => <div>Loading…</div>,
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;
  const named: Record<string, () => null> = {
    ArrowLeft: Icon,
    ChevronDown: Icon,
    ChevronRight: Icon,
    Circle: Icon,
    Ellipsis: Icon,
    Filter: Icon,
    Inbox: Icon,
    Loader2: Icon,
    Lock: Icon,
    MailOpen: Icon,
    MailPlus: Icon,
    Menu: Icon,
    Paperclip: Icon,
    Pencil: Icon,
    Plus: Icon,
    RefreshCcw: Icon,
    RefreshCw: Icon,
    RotateCcw: Icon,
    Search: Icon,
    Send: Icon,
    ShieldCheck: Icon,
    Star: Icon,
    Trash2: Icon,
    UserRoundPlus: Icon,
    X: Icon,
  };
  return new Proxy(named, {
    get: (target, prop) =>
      typeof prop === "string" ? (target[prop] ?? Icon) : Icon,
  });
});

jest.mock("@workspace/ui/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

jest.mock("@workspace/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: any) =>
    asChild ? children : <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  SimpleTooltip: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("../../components/mail/advanced-search-panel", () => ({
  AdvancedSearchPanel: () => null,
  AdvancedSearchToggle: () => null,
}));

jest.mock("../../lib/mail/api-service", () => ({
  mailDemoApiService: {
    getConfig: jest.fn(),
    getAccountStatus: jest.fn(),
    bootstrapAccountMailbox: jest.fn(),
    getAccountVaultBackup: jest.fn(),
    getVaultBackup: jest.fn(),
    getRecipientKey: jest.fn(),
    upsertVaultBackup: jest.fn(),
    upsertAccountVaultBackup: jest.fn(),
    syncAccount: jest.fn(),
  },
}));

const mockE2eeSession = { unlocked: true, listeners: new Set<() => void>() };
jest.mock("@/lib/e2ee-session", () => ({
  getActiveE2eeSession: () => null,
  hasActiveE2eeSession: () => mockE2eeSession.unlocked,
  subscribeActiveE2eeSession: (listener: () => void) => {
    mockE2eeSession.listeners.add(listener);
    return () => mockE2eeSession.listeners.delete(listener);
  },
}));

jest.mock("@/hooks/use-recent-contacts", () => ({
  useRecentContacts: () => ({
    recentContacts: { version: 1 as const, contacts: [] },
    recordUsage: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock("@/hooks/use-mail-realtime", () => ({
  useMailRealtime: jest.fn(),
}));

jest.mock("@/hooks/use-compose-draft-autosave", () => ({
  useComposeDraftAutosave: jest.fn(),
}));

jest.mock("../../lib/e2ee-password-cache", () => ({
  clearAuthPasswords: jest.fn(),
  clearLegacyRememberedPassword: jest.fn(),
}));

jest.mock("../../lib/mail/vault-secret", () => ({
  VAULT_WRAP_ALGORITHM: "e2ee-account-key-v1",
  generateVaultSecret: () => "sealed-secret",
  wrapVaultSecret: async (secret: string) => `wrapped:${secret}`,
  unwrapVaultSecret: async (wrapped: string) =>
    mockE2eeSession.unlocked && typeof wrapped === "string"
      ? wrapped.replace(/^wrapped:/, "")
      : null,
}));

jest.mock("../../lib/mail/vault-crypto", () => ({
  createEncryptedMailVault: jest.fn(),
  unlockEncryptedMailVault: jest.fn(),
  unlockEncryptedMailVaultWithDerivedKey: jest.fn(),
}));

const mockJmapClient = {
  discoverSession: jest.fn<() => Promise<any>>(),
  bootstrapMailboxState: jest.fn<() => Promise<any>>(),
  getAccountSettings: jest.fn<() => Promise<any>>(),
  getStalwartPolicySingletons: jest.fn<() => Promise<any>>(),
  getMailboxes: jest.fn<() => Promise<any>>(),
  getMailboxMessages:
    jest.fn<
      (
        ...args: Parameters<StalwartJmapClient["getMailboxMessages"]>
      ) => Promise<unknown>
    >(),
  getMessagesByIds: jest.fn<() => Promise<any>>(),
  getThreadMessages: jest.fn<() => Promise<any>>(),
  getIdentities: jest.fn<() => Promise<any>>(),
  sendMessage:
    jest.fn<
      (
        ...args: Parameters<StalwartJmapClient["sendMessage"]>
      ) => Promise<unknown>
    >(),
  uploadPreparedAttachment:
    jest.fn<StalwartJmapClient["uploadPreparedAttachment"]>(),
  uploadPreparedAttachments:
    jest.fn<StalwartJmapClient["uploadPreparedAttachments"]>(),
  uploadTextBlob: jest
    .fn<() => Promise<any>>()
    .mockResolvedValue({ blobId: "sealed-blob", size: 64, type: "text/plain" }),
  markAsRead: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  markAsUnread: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  toggleFlagged: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
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
  ensureEncryptOnAppendDisabled: jest
    .fn<() => Promise<any>>()
    .mockResolvedValue(undefined),
  setMailServerPolicy: jest.fn(),
  syncMailServerPolicy: jest.fn<() => Promise<any>>(),
  clearCachedSession: jest.fn(),
  searchMailboxMessages: jest
    .fn<
      (
        ...args: Parameters<StalwartJmapClient["searchMailboxMessages"]>
      ) => Promise<unknown>
    >()
    .mockResolvedValue({
      messages: [],
      total: 0,
    }),
  searchMailboxMessagesWithFilter: jest
    .fn<() => Promise<any>>()
    .mockResolvedValue({
      messages: [],
      total: 0,
    }),
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

const mockVerificationContext = { publicKeyArmored: "public-key-armored", fingerprint: "ABCD1234EF567890", ownAddresses: ["alice@solace.onl"] };
jest.mock("../../lib/mail/worker-client", () => ({
  mailCryptoWorkerClient: {
    getVerificationContext: jest.fn(),
    isVerificationContextCurrent: jest.fn(),
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
  MailSidebar: ({
    activeMailbox,
    onSelectMailbox,
    onCompose,
    onSignOut,
  }: {
    activeMailbox: { mailboxes: { id: string; name: string }[] } | null;
    onSelectMailbox: (id: string) => void;
    onCompose: () => void;
    onSignOut: () => void;
  }) =>
    activeMailbox ? (
      <nav>
        {activeMailbox.mailboxes.map((m) => (
          <button key={m.id} onClick={() => onSelectMailbox(m.id)}>
            {m.name}
          </button>
        ))}
        <button onClick={onCompose} aria-label="Compose">
          Compose
        </button>
        <button onClick={onSignOut} aria-label="Sign out">
          Sign out
        </button>
      </nav>
    ) : null,
}));

jest.mock("../../components/mail/message-list", () => ({
  MessageList: ({
    messages,
    onSelect,
    onToggleFlagged,
    onMarkAsRead,
    onMarkAsUnread,
    onDelete,
  }: {
    messages: {
      id: string;
      subject?: string;
      keywords?: Record<string, boolean>;
    }[];
    onSelect?: (id: string) => void;
    onToggleFlagged?: (id: string) => void;
    onMarkAsRead?: (id: string) => void;
    onMarkAsUnread?: (id: string) => void;
    onDelete?: (id: string) => void;
  }) =>
    messages.length === 0 ? (
      <p>No messages</p>
    ) : (
      <ul>
        {messages.map((m) => (
          <li
            key={m.id}
            data-message-row={m.id}
            data-unread={m.keywords?.$seen ? "false" : "true"}
            data-starred={m.keywords?.$flagged ? "true" : "false"}
          >
            <button type="button" onClick={() => onSelect?.(m.id)}>
              {m.subject}
            </button>
            <button
              type="button"
              aria-label={`Toggle star ${m.id}`}
              onClick={() => onToggleFlagged?.(m.id)}
            />
            <button
              type="button"
              aria-label={`Mark read ${m.id}`}
              onClick={() => onMarkAsRead?.(m.id)}
            />
            <button
              type="button"
              aria-label={`Mark unread ${m.id}`}
              onClick={() => onMarkAsUnread?.(m.id)}
            />
            <button
              type="button"
              aria-label={`Trash ${m.id}`}
              onClick={() => onDelete?.(m.id)}
            />
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
    onReplyAll,
    onSendReply,
    onClose,
    onPreviewAttachment,
  }: any) =>
    message ? (
      <div>
        <button type="button" aria-label="Close message" onClick={onClose} />
        <div>{message.subject}</div>
        <button type="button" aria-label="Preview image" onClick={() => onPreviewAttachment?.({ name: "synthetic.png", type: "image/png", content: new Uint8Array([1, 2, 3]) })}>
          Preview image
        </button>
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
        <button type="button" aria-label="Reply all" onClick={onReplyAll}>
          Reply all
        </button>
        <button
          type="button"
          onClick={() => void onSendReply?.("Thanks!", mockQuickReplyFiles)}
        >
          Send reply
        </button>
      </div>
    ) : null,
}));

jest.mock("../../components/mobile-app-switcher", () => ({
  MobileAppSwitcher: () => <div>App switcher</div>,
}));

jest.mock("../../components/mail/attachment-preview-dialog", () => ({
  AttachmentPreviewDialog: ({ preview, onOpenChange }: {
    preview: { name: string } | null;
    onOpenChange: (open: boolean) => void;
  }) => preview ? <div data-testid="attachment-preview">{preview.name}<button type="button" aria-label="Close attachment preview" onClick={() => onOpenChange(false)} /></div> : null,
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
      setComposeAttachments,
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
        {onExpand ? <button onClick={onExpand}>Expand compose</button> : null}
        <button
          onClick={() => setComposeAttachments(mockComposeAttachmentFiles)}
        >
          Attach fixture
        </button>
        <button onClick={() => void onSend()}>Send message</button>
      </div>
    );
  }

  return {
    ComposeForm: ({ onSend }: any) => {
      const { isFullCompose } = useMailComposeChrome();
      return isFullCompose ? <ComposeFields onSend={onSend} /> : null;
    },
    ComposeDialog: ({ onSend, onExpand }: any) => {
      const { isComposeOpen } = useMailComposeChrome();
      return isComposeOpen ? (
        <ComposeFields onSend={onSend} onExpand={onExpand} />
      ) : null;
    },
  };
});

jest.mock("../../hooks/use-smooth-router", () => ({
  useSmoothRouter: () => mockUseSmoothRouter(),
}));

import { MailApp } from "../../components/mail/mail-app";
import { getMailComposeBridge } from "@/components/mail/mail-compose-bridge";
import { RouteTransitionProvider } from "@/components/route-transition-provider";
import { completeAuthNavigation } from "@/lib/auth-navigation";
import { authSessionDataFixture } from "../mocks/auth-session";
import { authClient, useSession } from "@/lib/auth-client";
import { clearAuthPasswords } from "../../lib/e2ee-password-cache";
import { mailDemoApiService } from "../../lib/mail/api-service";
import { clearMailOpenPrefetch } from "../../lib/mail/mail-open-prefetch";
import {
  createEncryptedMailVault,
  unlockEncryptedMailVault,
} from "../../lib/mail/vault-crypto";
import { mailCryptoWorkerClient } from "../../lib/mail/worker-client";
import { toast } from "sonner";

const mockToast = jest.mocked(toast);
const mockUseSession = jest.mocked(useSession);
const mockGetSession = jest.mocked<
  (...args: Parameters<typeof authClient.getSession>) => Promise<unknown>
>(authClient.getSession);
const mockSignOut = jest.mocked<
  (...args: Parameters<typeof authClient.signOut>) => Promise<unknown>
>(authClient.signOut);
const mockCompleteAuthNavigation = jest.mocked(completeAuthNavigation);
const mockClearAuthPasswords = jest.mocked(clearAuthPasswords);
const mockApi = jest.mocked(mailDemoApiService);
const mockCreateEncryptedMailVault = jest.mocked(createEncryptedMailVault);
const mockUnlockEncryptedMailVault = jest.mocked(unlockEncryptedMailVault);
const mockWorkerClient = jest.mocked(mailCryptoWorkerClient);
const mockToastError = jest.mocked(toast.error);

const mockMailOAuthConfig = {
  mailTokenEndpoint: "https://api.solace.test/api/mail/oauth/access-token",
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

async function openMailboxSearch() {
  const trigger = container.querySelector<HTMLElement>(
    '[data-test="mailbox-search"]',
  );
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.click();
  });
  const searchInput = container.querySelector<HTMLInputElement>(
    'input[aria-label="Search messages"]',
  );
  expect(searchInput).not.toBeNull();
  return searchInput!;
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
  it.each(["shortcut", "reader action"])(
    "%s seeds reply-all Cc through the actual controller and compose bridge",
    async (source) => {
      const message = {
        id: "reply-all-message",
        subject: "Group plans",
        from: [{ email: "bob@solace.onl" }],
        replyTo: [{ email: "reply@solace.onl" }],
        to: [{ email: "alice@solace.onl" }, { email: "cara@solace.onl" }],
        cc: [{ email: "dan@solace.onl" }, { email: "cara@solace.onl" }],
        receivedAt: "2026-11-10T10:00:00Z",
        textBody: [{ partId: "text" }],
        bodyValues: { text: { value: "Original group message" } },
      };
      mockJmapClient.getMailboxMessages.mockResolvedValue({
        messages: [message],
        total: 1,
      });
      mockJmapClient.getMessagesByIds.mockResolvedValue([message]);
      mockJmapClient.getThreadMessages.mockResolvedValue([message]);
      await renderApp();
      await waitForExpectation(() =>
        expect(container.textContent).toContain("Group plans"),
      );
      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === "Group plans")
          ?.click();
      });
      await waitForExpectation(() =>
        expect(container.querySelector('[aria-label="Reply"]')).not.toBeNull(),
      );
      await act(async () => {
        if (source === "shortcut")
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "R", bubbles: true }),
          );
        else
          container
            .querySelector<HTMLButtonElement>('[aria-label="Reply all"]')
            ?.click();
      });
      await waitForExpectation(() => {
        expect(getMailComposeBridge()?.getDraft()).toMatchObject({
          to: "reply@solace.onl",
          cc: "cara@solace.onl, dan@solace.onl",
          bcc: "",
          composeMode: "reply",
        });
      });
      const quote = getMailComposeBridge()?.getDraft().body;
      await act(async () => getMailComposeBridge()?.clearCompose());
      await act(async () =>
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "r", bubbles: true }),
        ),
      );
      expect(getMailComposeBridge()?.getDraft()).toMatchObject({
        to: "reply@solace.onl",
        cc: "",
        body: quote,
      });
    },
  );

  beforeEach(async () => {
    mockAuthNavigationPending = false;
    mockComposeAttachmentFiles = [];
    mockQuickReplyFiles = [];
    clearMailOpenPrefetch();
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
    mockUseSmoothRouter.mockReset();
    mockUseSmoothRouter.mockReturnValue({
      ...mockNextRouter,
      startRouteTransition: jest.fn(),
      finishRouteTransition: jest.fn(),
      isRouteTransitionActive: false,
    });
    mockSignOut.mockReset();
    mockCompleteAuthNavigation.mockReset();
    mockCompleteAuthNavigation.mockImplementation(() => {
      // Stop a broken passive-effect loop before it can hang the test runner.
      if (mockCompleteAuthNavigation.mock.calls.length > 3) {
        throw new Error(
          "Mail auth navigation repeated before the page could unload",
        );
      }
    });
    localStorage.removeItem("mail:composeSettings");

    const sessionPayload = {
      data: {
        user: {
          id: "user-1",
          email: "alice@solace.onl",
          name: "Alice Example",
        },
      },
      isPending: false,
    } as const;
    mockUseSession.mockReturnValue(sessionPayload as any);
    mockGetSession.mockResolvedValue(sessionPayload as any);
    mockE2eeSession.unlocked = true;
    mockClearAuthPasswords.mockReset();

    mockApi.getConfig.mockResolvedValue({
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "http://192.168.2.213:8080",
      signupEnabled: true,
      oauth: mockMailOAuthConfig,
    });
    mockApi.getAccountStatus.mockResolvedValue({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: true,
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
      wrappedSecret: "wrapped:sealed-secret",
      wrapAlgorithm: "e2ee-account-key-v1",
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
    mockWorkerClient.getVerificationContext.mockReturnValue(mockVerificationContext);
    mockWorkerClient.isVerificationContextCurrent.mockReturnValue(true);
    mockJmapClient.uploadPreparedAttachment.mockReset();
    mockJmapClient.uploadPreparedAttachment.mockImplementation(
      async (_session, attachment) => ({
        blobId: "plain-attachment",
        name: attachment.filename,
        type: attachment.contentType,
        size: attachment.size,
      }),
    );
    mockJmapClient.uploadPreparedAttachments.mockReset();
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
    mockJmapClient.bootstrapMailboxState.mockResolvedValue({
      accountSettings: {
        encryptionAtRest: {
          "@type": "Enabled",
          publicKey: "synthetic-key",
          headerProtection: "none",
          encryptOnAppend: false,
          allowSpamTraining: false,
        },
      },
      emailSettings: null,
      jmapSettings: null,
      mailboxes: [
        { id: "inbox-1", name: "Inbox", role: "inbox" },
        { id: "drafts-1", name: "Drafts", role: "drafts" },
        { id: "junk-1", name: "Junk Mail", role: "junk" },
        { id: "sent-1", name: "Sent Items", role: "sent" },
      ],
      identities: [{ id: "identity-1", email: "alice@solace.onl" }],
    });
    mockJmapClient.getAccountSettings.mockResolvedValue({
      encryptionAtRest: {
        "@type": "Enabled",
        publicKey: "synthetic-key",
        headerProtection: "none",
        encryptOnAppend: false,
        allowSpamTraining: false,
      },
    });
    mockJmapClient.getStalwartPolicySingletons.mockResolvedValue({
      emailSettings: null,
      jmapSettings: null,
    });
    mockJmapClient.syncMailServerPolicy.mockResolvedValue(null);
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
          preview: "Hello Alice",
        },
      ],
      total: 1,
    });
    mockJmapClient.getMessagesByIds.mockImplementation(
      async (...args: unknown[]) => {
        const ids = args[1] as string[];
        return ids.map((id) => ({
          id,
          subject: "Encrypted hello",
          from: [{ email: "bob@solace.onl", name: "Bob" }],
          receivedAt: "2026-05-06T21:10:00.000Z",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Hello Alice" } },
        }));
      },
    );
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
    mockJmapClient.searchMailboxMessages.mockResolvedValue({
      messages: [],
      total: 0,
    });
    mockJmapClient.searchMailboxMessagesWithFilter.mockResolvedValue({
      messages: [],
      total: 0,
    });
  });

  afterEach(async () => {
    clearMailOpenPrefetch();
    act(() => {
      root.unmount();
    });
    container.remove();
    window.history.replaceState(null, "", "/");
    await resetMailVaultDatabase();
    jest.clearAllMocks();
  });

  async function renderApp(withRouteTransitions = false, strict = false) {
    await act(async () => {
      const app = (
        <QueryClientProvider client={queryClient}>
          <MailApp />
        </QueryClientProvider>
      );
      const content = withRouteTransitions ? (
        <RouteTransitionProvider>{app}</RouteTransitionProvider>
      ) : (
        app
      );
      root.render(
        strict ? <React.StrictMode>{content}</React.StrictMode> : content,
      );
      await Promise.resolve();
    });
  }

  function enableRealRouteTransitions() {
    const { useSmoothRouter } = jest.requireActual<
      typeof import("../../hooks/use-smooth-router")
    >("../../hooks/use-smooth-router");
    mockUseSmoothRouter.mockImplementation(useSmoothRouter);
  }

  function setMailSession(
    data: typeof authSessionDataFixture | null,
    isPending = false,
  ) {
    mockUseSession.mockReturnValue({
      data,
      isPending,
      isRefetching: false,
      error: null,
      refetch: jest.fn(() => Promise.resolve()),
    });
  }

  it("releases each replaced, closed and unmounted attachment URL once in Strict Mode", async () => {
    const previousCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const previousRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    let nextUrlId = 0;
    const create = jest.fn(() => `blob:synthetic-${++nextUrlId}`);
    const revoke = jest.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const click = async (label: string) => {
      const target = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      if (!target) throw new Error(`Missing ${label}`);
      await act(async () => target.click());
    };
    try {
      await renderApp(false, true);
      await waitForExpectation(() => expect(container.textContent).toContain("Encrypted hello"));
      const message = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Encrypted hello");
      if (!message) throw new Error("Missing message");
      await act(async () => message.click());
      await click("Preview image");
      expect(container.querySelector('[data-testid="attachment-preview"]')?.textContent).toContain("synthetic.png");
      expect(revoke).not.toHaveBeenCalled();
      await click("Preview image");
      expect(revoke.mock.calls).toEqual([["blob:synthetic-1"]]);
      await click("Close attachment preview");
      expect(revoke.mock.calls).toEqual([["blob:synthetic-1"], ["blob:synthetic-2"]]);
      await click("Preview image");
      await act(async () => root.render(<div />));
      expect(revoke.mock.calls).toEqual([["blob:synthetic-1"], ["blob:synthetic-2"], ["blob:synthetic-3"]]);
    } finally {
      await act(async () => root.render(<div />));
      if (previousCreate) Object.defineProperty(URL, "createObjectURL", previousCreate);
      else Reflect.deleteProperty(URL, "createObjectURL");
      if (previousRevoke) Object.defineProperty(URL, "revokeObjectURL", previousRevoke);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("redirects Mail once when the session disappears with the real router and Strict Mode", async () => {
    enableRealRouteTransitions();
    window.history.replaceState(null, "", "/mail?mbox=inbox");
    await renderApp(true, true);
    expect(mockCompleteAuthNavigation).not.toHaveBeenCalled();

    setMailSession(null);
    await renderApp(true, true);
    expect(mockCompleteAuthNavigation.mock.calls).toEqual([
      ["/login?next=%2Fmail%3Fmbox%3Dinbox"],
    ]);
    await renderApp(true, true);
    expect(mockCompleteAuthNavigation).toHaveBeenCalledTimes(1);
  });

  it("waits for Mail auth to resolve before redirecting and preserves the mailbox URL", async () => {
    enableRealRouteTransitions();
    window.history.replaceState(null, "", "/mail?mbox=drafts");
    setMailSession(null, true);
    await renderApp(true);
    expect(mockCompleteAuthNavigation).not.toHaveBeenCalled();

    setMailSession(null);
    await renderApp(true);
    expect(mockCompleteAuthNavigation.mock.calls).toEqual([
      ["/login?next=%2Fmail%3Fmbox%3Ddrafts"],
    ]);
  });

  it("completes Mail logout and clears the mailbox without restarting auth navigation", async () => {
    enableRealRouteTransitions();
    window.history.replaceState(null, "", "/mail?mbox=inbox");
    mockSignOut.mockResolvedValue({ data: { success: true }, error: null });
    await renderApp(true, true);
    await waitForExpectation(() =>
      expect(
        container.querySelector('button[aria-label="Sign out"]'),
      ).not.toBeNull(),
    );
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sign out"]',
    );
    if (!button) throw new Error("Missing sign-out button");

    await act(async () => {
      button.click();
      await Promise.resolve();
      setMailSession(null);
    });
    await renderApp(true, true);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    await waitForExpectation(() =>
      expect(mockClearAuthPasswords).toHaveBeenCalledTimes(1),
    );
    expect(mockWorkerClient.clear).toHaveBeenCalled();
    expect(mockCompleteAuthNavigation.mock.calls).toEqual([["/"]]);
    expect(container.textContent).not.toContain("Encrypted hello");

    await renderApp(true, true);
    expect(mockCompleteAuthNavigation).toHaveBeenCalledTimes(1);
  });

  it("auto-provisions and opens the mailbox on first visit", async () => {
    mockApi.getAccountStatus.mockResolvedValueOnce({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: false,
    });

    await renderApp();

    await waitForExpectation(() => {
      expect(mockWorkerClient.generateKeyPair).toHaveBeenCalledWith({
        name: "Alice Example",
        email: "alice@solace.onl",
        privateKeyPassphrase: "sealed-secret",
      });
    });
    expect(mockCreateEncryptedMailVault).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alice@solace.onl",
        publicKeyArmored: "public-key-armored",
        encryptedPrivateKeyArmored: "private-key-armored",
      }),
      "sealed-secret",
    );
    expect(mockApi.bootstrapAccountMailbox).toHaveBeenCalledWith({
      publicKeyArmored: "public-key-armored",
      fingerprint: "ABCD1234EF567890",
      algorithm: "openpgp",
      createdAt: expect.any(String),
      vaultVersion: 1,
      encryptedVaultB64: "vault-b64",
      wrappedSecret: "wrapped:sealed-secret",
      wrapAlgorithm: "e2ee-account-key-v1",
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
    expect(mockApi.getAccountVaultBackup).toHaveBeenCalled();
    expect(mockUnlockEncryptedMailVault).toHaveBeenCalledWith(
      "vault-b64",
      "sealed-secret",
      {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
      expect.any(Function),
    );
    expect(container.textContent).toContain("Encrypted hello");
  });

  it("retries a transient auto-provision failure without surfacing a mailbox error", async () => {
    mockApi.getAccountStatus.mockResolvedValueOnce({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: false,
    });
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
      expect(mockApi.getAccountVaultBackup).toHaveBeenCalled();
      expect(container.textContent).toContain("Encrypted hello");
    });
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("provisions a mailbox on first visit without any password", async () => {
    mockApi.getAccountStatus.mockResolvedValueOnce({
      email: "alice@solace.onl",
      displayName: "Alice Example",
      provisioned: false,
    });

    await renderApp();

    await waitForExpectation(() => {
      expect(mockApi.bootstrapAccountMailbox).toHaveBeenCalled();
    });
    const payload = mockApi.bootstrapAccountMailbox.mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("password");
    expect(payload.wrappedSecret).toBe("wrapped:sealed-secret");
    expect(container.textContent).not.toContain("One-time mailbox migration");
  });

  it("signs in with JMAP credentials, unlocks the vault, and renders inbox messages", async () => {
    await renderApp();

    expect(mockApi.getAccountVaultBackup).toHaveBeenCalled();
    expect(mockUnlockEncryptedMailVault).toHaveBeenCalledWith(
      "vault-b64",
      "sealed-secret",
      {
        saltB64: "salt-b64",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
      expect.any(Function),
    );
    expect(mockWorkerClient.loadVault).toHaveBeenCalledWith({
      privateKeyArmored: "private-key-armored",
      privateKeyPassphrase: "sealed-secret",
      publicKeyArmored: "public-key-armored",
      ownerUserId: "mail-user-1",
      ownAddresses: ["alice@solace.onl"],
    });
    expect(container.textContent).toContain("Encrypted hello");
    expect(container.textContent).toContain("Inbox");
  });

  it("automatically opens a provisioned mailbox when the auth password is still cached", async () => {
    await renderApp();

    await waitForExpectation(() => {
      expect(mockApi.getAccountVaultBackup).toHaveBeenCalled();
      expect(mockUnlockEncryptedMailVault).toHaveBeenCalledWith(
        "vault-b64",
        "sealed-secret",
        {
          saltB64: "salt-b64",
          memoryKiB: 65536,
          iterations: 3,
          parallelism: 4,
        },
        expect.any(Function),
      );
    });
    expect(container.textContent).toContain("Encrypted hello");
  });

  it("focuses inline search on / without inserting the slash or clearing the message list", async () => {
    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    await act(async () => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "/",
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search messages"]',
    );
    expect(searchInput).not.toBeNull();

    await waitForExpectation(() => {
      expect(document.activeElement).toBe(searchInput);
    });
    expect(searchInput?.value).toBe("");
    expect(container.textContent).toContain("Encrypted hello");
    expect(mockJmapClient.searchMailboxMessages).not.toHaveBeenCalled();
    expect(
      mockJmapClient.searchMailboxMessagesWithFilter,
    ).not.toHaveBeenCalled();
  });

  it("runs server search after typing a query without leaving the list empty while loading", async () => {
    let resolveSearch:
      | ((value: {
          messages: { id: string; subject: string }[];
          total: number;
        }) => void)
      | null = null;
    mockJmapClient.searchMailboxMessages.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const searchInput = await openMailboxSearch();

    await act(async () => {
      setInputValue(searchInput!, "hello");
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Searching…");
      expect(container.textContent).not.toContain("Encrypted hello");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await waitForExpectation(() => {
      expect(mockJmapClient.searchMailboxMessages).toHaveBeenCalledWith(
        expect.anything(),
        "inbox-1",
        "hello",
        40,
      );
    });

    await act(async () => {
      resolveSearch?.({
        messages: [
          {
            id: "mail-search-1",
            subject: "Matched hello",
          },
        ],
        total: 1,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(
        mockJmapClient.searchMailboxMessagesWithFilter,
      ).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Matched hello");
    });
  });

  it("keeps a loaded inbox message visible when punctuation blocks server FTS", async () => {
    mockJmapClient.getMailboxMessages.mockResolvedValue({
      messages: [
        {
          id: "mail-punct",
          subject: "hi me!",
          from: [{ email: "bob@solace.onl", name: "Bob" }],
          receivedAt: "2026-05-06T21:10:00.000Z",
          preview: "Body",
        },
      ],
      total: 1,
    });
    mockJmapClient.searchMailboxMessages.mockResolvedValue({
      messages: [],
      total: 0,
    });

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("hi me!");
    });

    const searchInput = await openMailboxSearch();

    await act(async () => {
      setInputValue(searchInput!, "hi me");
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitForExpectation(() => {
      expect(mockJmapClient.searchMailboxMessages).toHaveBeenCalledWith(
        expect.anything(),
        "inbox-1",
        "hi me",
        40,
      );
      expect(container.textContent).toContain("hi me!");
    });
  });

  it("shows the search loader while debouncing and after the query changes", async () => {
    let resolveFirstSearch:
      | ((value: {
          messages: { id: string; subject: string }[];
          total: number;
        }) => void)
      | null = null;
    mockJmapClient.searchMailboxMessages.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirstSearch = resolve;
        }),
    );

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const searchInput = await openMailboxSearch();

    await act(async () => {
      setInputValue(searchInput!, "hello");
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Searching…");
      expect(container.textContent).not.toContain("Encrypted hello");
    });

    await act(async () => {
      resolveFirstSearch?.({
        messages: [
          {
            id: "mail-search-1",
            subject: "Matched hello",
          },
        ],
        total: 1,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Matched hello");
    });

    mockJmapClient.searchMailboxMessages.mockImplementation(
      () => new Promise(() => {}),
    );

    await act(async () => {
      setInputValue(searchInput!, "hellos");
    });

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Searching…");
      expect(container.textContent).not.toContain("Encrypted hello");
      expect(container.textContent).not.toContain("Matched hello");
    });
  });

  it("restores the inbox list immediately when search is cleared", async () => {
    mockJmapClient.searchMailboxMessages.mockResolvedValue({
      messages: [],
      total: 0,
    });

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const searchInput = await openMailboxSearch();

    await act(async () => {
      setInputValue(searchInput!, "hello");
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitForExpectation(() => {
      expect(mockJmapClient.searchMailboxMessages).toHaveBeenCalled();
      expect(container.textContent).not.toContain("Encrypted hello");
    });

    await act(async () => {
      setInputValue(searchInput!, "");
    });

    await waitForExpectation(() => {
      expect(searchInput?.value).toBe("");
      expect(container.textContent).toContain("Encrypted hello");
    });
  });

  it("flushes debounced search immediately when Enter is pressed", async () => {
    mockJmapClient.searchMailboxMessages.mockResolvedValue({
      messages: [
        {
          id: "mail-search-enter",
          subject: "Enter matched",
        },
      ],
      total: 1,
    });

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const searchInput = await openMailboxSearch();

    await act(async () => {
      setInputValue(searchInput!, "enter");
      searchInput!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(mockJmapClient.searchMailboxMessages).toHaveBeenCalledWith(
        expect.anything(),
        "inbox-1",
        "enter",
        40,
      );
      expect(container.textContent).toContain("Enter matched");
    });
  });

  it("does not run search for whitespace-only input", async () => {
    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const searchInput = await openMailboxSearch();

    await act(async () => {
      setInputValue(searchInput!, "   ");
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitForExpectation(() => {
      expect(searchInput?.value).toBe("");
      expect(container.textContent).toContain("Encrypted hello");
      expect(mockJmapClient.searchMailboxMessages).not.toHaveBeenCalled();
      expect(
        mockJmapClient.searchMailboxMessagesWithFilter,
      ).not.toHaveBeenCalled();
    });
  });

  it("shows an empty search state instead of flashing inbox messages", async () => {
    mockJmapClient.searchMailboxMessages.mockResolvedValue({
      messages: [],
      total: 0,
    });

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const searchInput = await openMailboxSearch();

    await act(async () => {
      setInputValue(searchInput!, "nomatch");
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitForExpectation(() => {
      expect(mockJmapClient.searchMailboxMessages).toHaveBeenCalled();
      expect(container.textContent).toContain("No results for “nomatch”");
      expect(container.textContent).toContain("Search covers Inbox only.");
      expect(container.textContent).not.toContain("Encrypted hello");
    });

    act(() => {
      setInputValue(searchInput!, "");
    });

    expect(container.textContent).not.toContain(
      "No messages match these filters",
    );
    expect(container.textContent).toContain("Encrypted hello");
  });

  it("clears inline search when switching mailboxes", async () => {
    mockJmapClient.getMailboxMessages.mockImplementation(
      async (...args: unknown[]) => {
        const mailboxId = args[1] as string;
        if (mailboxId === "sent-1") {
          return {
            messages: [
              {
                id: "mail-sent-1",
                subject: "Sent item",
                from: [{ email: "alice@solace.onl", name: "Alice" }],
                receivedAt: "2026-05-06T21:10:00.000Z",
                preview: "Sent body",
              },
            ],
            total: 1,
          };
        }
        return {
          messages: [
            {
              id: "mail-1",
              subject: "Encrypted hello",
              from: [{ email: "bob@solace.onl", name: "Bob" }],
              receivedAt: "2026-05-06T21:10:00.000Z",
              preview: "Hello Alice",
            },
          ],
          total: 1,
        };
      },
    );

    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    const searchInput = await openMailboxSearch();

    await act(async () => {
      setInputValue(searchInput!, "hello");
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitForExpectation(() => {
      expect(searchInput?.value).toBe("hello");
    });

    const sentMailboxButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent === "Sent Items");
    expect(sentMailboxButton).toBeDefined();

    await act(async () => {
      sentMailboxButton!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(
        container.querySelector('input[aria-label="Search messages"]'),
      ).toBeNull();
      expect(container.textContent).toContain("Sent item");
      expect(container.textContent).not.toContain("Encrypted hello");
    });
  });

  it("does not auto-open the newest message on desktop", async () => {
    await renderApp();

    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });

    expect(container.querySelector('button[aria-label="Reply"]')).toBeNull();
  });

  it("keeps the message rendered while the desktop reader slides closed", async () => {
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

    const findCloseButton = () =>
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Close message"]',
      );
    await waitForExpectation(() => {
      expect(findCloseButton()).not.toBeNull();
    });
    // The slide starts a couple of frames after the reader renders.
    await waitForExpectation(() => {
      expect(findCloseButton()?.closest("[inert]")).toBeNull();
    });

    act(() => {
      findCloseButton()?.click();
    });

    const reply = container.querySelector('button[aria-label="Reply"]');
    expect(reply).not.toBeNull();
    expect(reply?.closest("[inert]")).not.toBeNull();

    await waitForExpectation(() => {
      expect(container.querySelector('button[aria-label="Reply"]')).toBeNull();
    });
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
      expect.objectContaining({ limit: 25, position: 0 }),
    );
    expect(container.textContent).toContain("Junk hello");
  });

  it("sends plaintext mail without looking up recipient keys", async () => {
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

    const composeButton = container.querySelector(
      '[aria-label="Compose"]',
    ) as HTMLButtonElement | null;
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
        expect.objectContaining({ limit: 25 }),
      );
    });

    expect(mockApi.getRecipientKey).not.toHaveBeenCalled();
    // External mail is submitted in plaintext, but the stored Sent copy is sealed to the sender's own key only.
    expect(mockWorkerClient.encryptForRecipients).toHaveBeenCalledWith({
      plaintext: expect.stringContaining("Plaintext body"),
      recipientPublicKeysArmored: ["public-key-armored"],
    });
    for (const [call] of mockWorkerClient.encryptForRecipients.mock.calls) {
      expect(call.recipientPublicKeysArmored).toEqual(["public-key-armored"]);
    }
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
        sentCopyCiphertext: {
          blobId: "sealed-blob",
          size: 64,
          type: "text/plain",
        },
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
      expect(
        container.querySelector('input[placeholder="Recipient"]'),
      ).not.toBe(null);
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
      expect(
        container.querySelector('input[placeholder="Recipient"]'),
      ).not.toBe(null);
    });

    expect(container.textContent).not.toContain("App switcher");
  });

  it("encrypts internal mail before sending it through the JMAP proxy", async () => {
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

    const composeButton = container.querySelector(
      '[aria-label="Compose"]',
    ) as HTMLButtonElement | null;
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

    const quickReplyButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent === "Send reply");

    await act(async () => {
      quickReplyButton?.click();
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(container.textContent).toContain(
        "alice@solace.onl|Re: Encrypted hello|Thanks!",
      );
    });
  });

  it("adds a sent compose reply into the active conversation immediately", async () => {
    localStorage.setItem(
      "mail:composeSettings",
      JSON.stringify({
        plainTextMode: true,
        attachmentReminderEnabled: false,
        attachmentReminderKeywords: [],
        signaturePosition: "below_quote",
        signatureSeparatorEnabled: true,
        autoSelectReplyIdentity: false,
      }),
    );
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

    await waitForExpectation(() => {
      const textarea = container.querySelector(
        "textarea",
      ) as HTMLTextAreaElement | null;
      expect(textarea?.value).toContain("Hello Alice");
    });

    act(() => {
      const textarea = container.querySelector(
        "textarea",
      ) as HTMLTextAreaElement;
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      );

      descriptor?.set?.call(textarea, "Compose reply body");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const sendButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Send message",
    );

    await act(async () => {
      sendButton?.click();
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(mockWorkerClient.encryptForRecipients).toHaveBeenCalledWith(
        expect.objectContaining({
          plaintext: expect.stringContaining("Compose reply body"),
        }),
      );
    });

    await waitForExpectation(() => {
      expect(container.textContent).toContain(
        "alice@solace.onl|Re: Encrypted hello|Compose reply body",
      );
    });
  });

  it("retries opening the mailbox once the account keys unlock", async () => {
    mockE2eeSession.unlocked = false;

    await renderApp();
    expect(mockUnlockEncryptedMailVault).not.toHaveBeenCalled();

    await act(async () => {
      mockE2eeSession.unlocked = true;
      for (const listener of mockE2eeSession.listeners) listener();
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(mockUnlockEncryptedMailVault).toHaveBeenCalledWith(
        "vault-b64",
        "sealed-secret",
        expect.any(Object),
        expect.any(Function),
      );
    });
    await waitForExpectation(() => {
      expect(container.textContent).toContain("Encrypted hello");
    });
  });

  function attachmentFile(): File {
    const file = new File(["Synthetic attachment"], "fixture.txt", {
      type: "text/plain",
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () =>
        new TextEncoder().encode("Synthetic attachment").buffer,
    });
    return file;
  }

  async function composeWithAttachment(
    recipient: string,
  ): Promise<HTMLButtonElement> {
    mockComposeAttachmentFiles = [attachmentFile()];
    await renderApp();
    await waitForExpectation(() =>
      expect(container.textContent).toContain("Encrypted hello"),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Compose"]')
        ?.click(),
    );
    const recipientInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="Recipient"]',
    );
    const subjectInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="Subject"]',
    );
    if (!recipientInput || !subjectInput)
      throw new Error("Missing compose fields");
    setInputValue(recipientInput, recipient);
    setInputValue(subjectInput, "Attachment proof");
    await act(async () => {
      const body = container.querySelector("textarea");
      if (!body) throw new Error("Missing compose body");
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(body, "See attached");
      body.dispatchEvent(new Event("input", { bubbles: true }));
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Attach fixture")
        ?.click();
    });
    const button = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Send message",
    );
    if (!button) throw new Error("Missing send action");
    return button;
  }

  it("routes encrypted compose attachments through import and ignores a same-session double click", async () => {
    const button = await composeWithAttachment("bob@solace.onl");
    let currentAtSubmission = false;
    mockJmapClient.sendMessage.mockImplementationOnce(async (_session, input) => {
      currentAtSubmission = input.isCurrent?.() ?? false;
      return { emailId: "sent", threadId: null, submissionId: "submission" };
    });
    await act(async () => {
      button.click();
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitForExpectation(() =>
      expect(mockJmapClient.sendMessage).toHaveBeenCalledTimes(1),
    );
    const message = mockJmapClient.sendMessage.mock.calls[0]?.[1];
    expect(message).toMatchObject({
      sendScope: expect.stringMatching(/^compose:/),
      textBody: "",
      pgpMimeMessage: expect.stringContaining("BEGIN PGP MESSAGE"),
      contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(currentAtSubmission).toBe(true);
    expect(message?.isCurrent?.()).toBe(true);
    expect(message?.isUiCurrent?.()).toBe(false);
    expect(message?.attachments).toBeUndefined();
    expect(mockJmapClient.uploadPreparedAttachment).not.toHaveBeenCalled();
    expect(mockJmapClient.uploadPreparedAttachments).not.toHaveBeenCalled();
  });

  it("uploads external compose attachments only through the plaintext route", async () => {
    const button = await composeWithAttachment("peer@example.com");
    await act(async () => {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitForExpectation(() =>
      expect(mockJmapClient.sendMessage).toHaveBeenCalledTimes(1),
    );
    expect(mockJmapClient.uploadPreparedAttachment).toHaveBeenCalledTimes(1);
    expect(mockJmapClient.uploadPreparedAttachment).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.any(Function));
    expect(mockJmapClient.sendMessage.mock.calls[0]?.[1]).toMatchObject({
      sendScope: expect.stringMatching(/^compose:/),
      attachments: [expect.objectContaining({ blobId: "plain-attachment" })],
      pgpMimeMessage: undefined,
    });
  });

  it("keeps a replacement compose's fields when an older send finishes", async () => {
    const button = await composeWithAttachment("bob@solace.onl");
    let finish: ((value: { emailId: string; threadId: string | null; submissionId: string }) => void) | undefined;
    mockJmapClient.sendMessage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await waitForExpectation(() => expect(mockJmapClient.sendMessage).toHaveBeenCalledTimes(1));
    const oldMessage = mockJmapClient.sendMessage.mock.calls[0]?.[1];
    await act(async () => getMailComposeBridge()?.seedNewMessage({ email: "carol@solace.onl", name: "Carol" }));
    const subject = container.querySelector<HTMLInputElement>('input[placeholder="Subject"]');
    if (!subject) throw new Error("Replacement compose did not open");
    setInputValue(subject, "Replacement subject");
    await act(async () => {
      const body = container.querySelector("textarea");
      if (!body) throw new Error("Replacement body is missing");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(body, "Keep replacement edits");
      body.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const replacement = getMailComposeBridge()?.getComposeSessionId();
    expect(oldMessage?.isCurrent?.()).toBe(true);
    expect(oldMessage?.isUiCurrent?.()).toBe(false);
    await act(async () => { finish?.({ emailId: "old-sent", threadId: "old-thread", submissionId: "old-receipt" }); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(getMailComposeBridge()?.getComposeSessionId()).toBe(replacement);
    expect(getMailComposeBridge()?.getDraft()).toMatchObject({ to: "Carol <carol@solace.onl>", subject: "Replacement subject", body: "Keep replacement edits" });
    expect(container.querySelector('input[placeholder="Subject"]')).not.toBeNull();
  });

  it("stops a stale vault before encrypting or uploading compose attachments", async () => {
    const button = await composeWithAttachment("peer@example.com");
    mockWorkerClient.isVerificationContextCurrent.mockReturnValue(false);
    await act(async () => {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockWorkerClient.encryptForRecipients).not.toHaveBeenCalled();
    expect(mockJmapClient.uploadPreparedAttachment).not.toHaveBeenCalled();
    expect(mockJmapClient.sendMessage).not.toHaveBeenCalled();
    expect(
      container.querySelector('input[placeholder="Subject"]'),
    ).not.toBeNull();
  });

  it("routes quick-reply attachments through import with a separate session scope", async () => {
    mockQuickReplyFiles = [attachmentFile()];
    await renderApp();
    await waitForExpectation(() =>
      expect(container.textContent).toContain("Encrypted hello"),
    );
    const open = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Encrypted hello",
    );
    await act(async () => open?.click());
    const button = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Send reply",
    );
    await act(async () => {
      button?.click();
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitForExpectation(() =>
      expect(mockJmapClient.sendMessage).toHaveBeenCalledTimes(1),
    );
    expect(mockJmapClient.sendMessage.mock.calls[0]?.[1]).toMatchObject({
      sendScope: expect.stringMatching(/^quick-reply:/),
      textBody: "",
      pgpMimeMessage: expect.stringContaining("BEGIN PGP MESSAGE"),
      contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(mockJmapClient.uploadPreparedAttachment).not.toHaveBeenCalled();
    expect(mockJmapClient.uploadPreparedAttachments).not.toHaveBeenCalled();
  });

  describe("keyword edits against server answers that were read earlier", () => {
    /** What the fake server holds; reads answer from it at the moment they are asked. */
    let serverKeywords: Record<string, Record<string, boolean>>;

    function deferred<T>() {
      let resolve: (value: T) => void = () => undefined;
      const promise = new Promise<T>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }

    const row = (id: string, keywords: Record<string, boolean> = {}) => ({
      id,
      subject: id === "mail-1" ? "Encrypted hello" : "Second message",
      from: [{ email: "bob@solace.onl", name: "Bob" }],
      receivedAt:
        id === "mail-1" ? "2026-05-06T21:10:00.000Z" : "2026-05-06T20:10:00.000Z",
      preview: "Hello Alice",
      keywords,
      mailboxIds: { "inbox-1": true },
    });

    const snapshot = (
      records: ReturnType<typeof row>[],
      destroyed: string[] = [],
    ) => ({
      accountId: "b",
      initialized: true,
      changedTypes: ["Email"],
      email: {
        oldState: "email-old",
        newState: "email-new",
        created: [],
        updated: records.map((record) => record.id),
        destroyed,
        records,
      },
      mailbox: { oldState: "m", newState: "m", created: [], updated: [], destroyed: [], records: [] },
      thread: { oldState: "t", newState: "t", created: [], updated: [], destroyed: [], records: [] },
    });

    /** Delivers a snapshot the way the realtime hook does, for an API sync response and an embedded SSE payload alike. */
    async function deliverSync(
      records: ReturnType<typeof row>[],
      destroyed: string[] = [],
    ) {
      const { useMailRealtime } = jest.requireMock<
        typeof import("../../hooks/use-mail-realtime")
      >("@/hooks/use-mail-realtime");
      const input = jest.mocked(useMailRealtime).mock.calls.at(-1)?.[0];
      if (!input) throw new Error("The realtime hook was not mounted");
      await act(async () => {
        await input.onSync(snapshot(records, destroyed) as any);
      });
    }

    const listRow = (id: string) =>
      container.querySelector<HTMLElement>(`[data-message-row="${id}"]`);
    const isUnread = (id = "mail-1") => listRow(id)?.dataset.unread === "true";
    const isStarred = (id = "mail-1") => listRow(id)?.dataset.starred === "true";
    const confirmingReads = () =>
      mockJmapClient.getMessagesByIds.mock.calls.filter(
        (call: unknown[]) =>
          (call[2] as { includeBodies?: boolean } | undefined)?.includeBodies === false,
      );

    async function press(label: string) {
      const button = container.querySelector<HTMLButtonElement>(
        `[aria-label="${label}"]`,
      );
      if (!button) throw new Error(`No "${label}" control`);
      await act(async () => {
        button.click();
      });
    }

    async function openInbox(
      messages: ReturnType<typeof row>[],
      strict = false,
    ) {
      serverKeywords = Object.fromEntries(
        messages.map((message) => [message.id, { ...message.keywords }]),
      );
      mockJmapClient.getMailboxMessages.mockResolvedValue({
        messages,
        total: messages.length,
      });
      mockJmapClient.getMessagesByIds.mockImplementation(
        async (...args: unknown[]) =>
          (args[1] as string[]).map((id) => ({
            ...row(id, { ...serverKeywords[id] }),
            // A reader fetch must come back with a body, or the app keeps asking for one.
            textBody: [{ partId: "text" }],
            bodyValues: { text: { value: "Hello Alice" } },
          })),
      );
      await renderApp(false, strict);
      await waitForExpectation(() =>
        expect(listRow("mail-1")).not.toBeNull(),
      );
    }

    it("keeps a star through a sync snapshot read before the write, in flight or already answered", async () => {
      await openInbox([row("mail-1")]);
      const write = deferred<void>();
      mockJmapClient.toggleFlagged.mockReturnValueOnce(write.promise);

      await press("Toggle star mail-1");
      expect(isStarred()).toBe(true);
      await deliverSync([row("mail-1")]);
      expect(isStarred()).toBe(true);
      expect(confirmingReads()).toHaveLength(0);

      serverKeywords["mail-1"] = { $flagged: true };
      await act(async () => {
        write.resolve();
      });
      await waitForExpectation(() => expect(confirmingReads()).toHaveLength(1));
      expect(isStarred()).toBe(true);

      await deliverSync([row("mail-1")]);
      await waitForExpectation(() => expect(confirmingReads()).toHaveLength(2));
      expect(isStarred()).toBe(true);
    });

    it("keeps a message unread through an earlier snapshot, then shows another device marking it read", async () => {
      await openInbox([row("mail-1", { $seen: true })]);
      expect(isUnread()).toBe(false);
      const write = deferred<void>();
      mockJmapClient.markAsUnread.mockReturnValueOnce(write.promise);

      await press("Mark unread mail-1");
      expect(isUnread()).toBe(true);
      await deliverSync([row("mail-1", { $seen: true })]);
      expect(isUnread()).toBe(true);

      serverKeywords["mail-1"] = {};
      await act(async () => {
        write.resolve();
      });
      await deliverSync([row("mail-1", { $seen: true })]);
      await waitForExpectation(() =>
        expect(confirmingReads().length).toBeGreaterThan(0),
      );
      expect(isUnread()).toBe(true);

      serverKeywords["mail-1"] = { $seen: true, $flagged: true };
      await deliverSync([row("mail-1", { $seen: true, $flagged: true })]);
      await waitForExpectation(() => expect(isUnread()).toBe(false));
      expect(isStarred()).toBe(true);
    });

    it("merges a held manual refresh into the list as it is now: edits, a delete and the sync that follows", async () => {
      await openInbox([row("mail-1", { $seen: true }), row("mail-2", { $seen: true })]);
      const page = deferred<unknown>();
      const sync = deferred<unknown>();
      mockJmapClient.getMailboxMessages.mockReturnValueOnce(page.promise);
      mockApi.syncAccount.mockReturnValueOnce(sync.promise as any);

      const loads = mockJmapClient.getMailboxMessages.mock.calls.length;
      await press("Refresh");
      await waitForExpectation(() =>
        expect(mockJmapClient.getMailboxMessages).toHaveBeenCalledTimes(loads + 1),
      );

      await press("Toggle star mail-1");
      serverKeywords["mail-1"] = { $seen: true, $flagged: true };
      await press("Mark unread mail-1");
      serverKeywords["mail-1"] = { $flagged: true };
      await waitForExpectation(() => {
        expect(mockJmapClient.toggleFlagged).toHaveBeenCalledTimes(1);
        expect(mockJmapClient.markAsUnread).toHaveBeenCalledTimes(1);
      });
      await press("Trash mail-2");
      expect(listRow("mail-2")).toBeNull();

      await act(async () => {
        page.resolve({
          messages: [row("mail-1", { $seen: true }), row("mail-2", { $seen: true })],
          total: 2,
        });
      });
      expect(isStarred()).toBe(true);
      expect(isUnread()).toBe(true);
      expect(listRow("mail-2")).toBeNull();

      await act(async () => {
        sync.resolve(snapshot([row("mail-1", { $seen: true })]));
      });
      await waitForExpectation(() =>
        expect(confirmingReads().length).toBeGreaterThan(0),
      );
      expect(isStarred()).toBe(true);
      expect(isUnread()).toBe(true);
    });

    it.each([false, true])(
      "closes the open message when a sync removes its row and keeps it open otherwise (strict mode %s)",
      async (strict) => {
        await openInbox([row("mail-1"), row("mail-2")], strict);
        await act(async () => {
          Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent === "Encrypted hello")
            ?.click();
        });
        const readerOpen = () =>
          container.querySelector('[aria-label="Close message"]') !== null;
        await waitForExpectation(() => expect(readerOpen()).toBe(true));

        await deliverSync([], ["mail-2"]);
        await waitForExpectation(() => expect(listRow("mail-2")).toBeNull());
        expect(readerOpen()).toBe(true);

        await deliverSync([], ["mail-1"]);
        await waitForExpectation(() => {
          expect(listRow("mail-1")).toBeNull();
          expect(readerOpen()).toBe(false);
        });
      },
      15_000,
    );

    it("drops a held manual refresh when another mailbox is open by the time it answers", async () => {
      await openInbox([row("mail-1")]);
      const page = deferred<unknown>();
      mockJmapClient.getMailboxMessages.mockImplementation(
        async (...args: unknown[]) =>
          args[1] === "junk-1"
            ? {
                messages: [
                  {
                    ...row("mail-9"),
                    subject: "Junk hello",
                    mailboxIds: { "junk-1": true },
                  },
                ],
                total: 1,
              }
            : page.promise,
      );

      const loads = mockJmapClient.getMailboxMessages.mock.calls.length;
      await press("Refresh");
      await waitForExpectation(() =>
        expect(mockJmapClient.getMailboxMessages).toHaveBeenCalledTimes(loads + 1),
      );
      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((element) => element.textContent?.includes("Junk Mail"))
          ?.click();
      });
      await waitForExpectation(() => expect(listRow("mail-9")).not.toBeNull());

      await act(async () => {
        page.resolve({ messages: [row("mail-1")], total: 1 });
      });
      expect(listRow("mail-9")).not.toBeNull();
      expect(listRow("mail-1")).toBeNull();
    });
  });
});
