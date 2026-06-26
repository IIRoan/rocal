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
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
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

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock clipboard API
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  value: { writeText: jest.fn().mockImplementation(() => Promise.resolve()) },
});

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), {
    error: jest.fn(),
  }),
}));

jest.mock("@gsap/react", () => ({
  useGSAP: jest.fn(),
}));

jest.mock("gsap", () => ({
  __esModule: true,
  default: {
    set: jest.fn(),
    to: jest.fn(),
    killTweensOf: jest.fn(),
    timeline: jest.fn(() => ({
      to: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      call: jest.fn().mockReturnThis(),
    })),
  },
}));

jest.mock("@workspace/ui/hooks", () => ({
  useIsMobile: () => false,
  usePrefersReducedMotion: () => false,
}));

jest.mock("@workspace/ui/lib/utils", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

jest.mock("@workspace/ui/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: any) =>
    asChild ? children : <button>{children}</button>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@workspace/ui/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DrawerClose: ({ children, asChild }: any) =>
    asChild ? children : <button>{children}</button>,
}));

jest.mock("@workspace/ui/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    "aria-label": ariaLabel,
    asChild,
    ...rest
  }: any) =>
    asChild ? (
      children
    ) : (
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        {...rest}
      >
        {children}
      </button>
    ),
}));

jest.mock("@workspace/ui/components/ui/separator", () => ({
  Separator: ({ className, orientation }: any) => (
    <hr className={className} data-orientation={orientation} aria-hidden />
  ),
}));

jest.mock("@workspace/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: any) =>
    asChild ? children : <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

jest.mock("@workspace/ui/components/ui/dropdown-menu", () => {
  const Passthrough = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  );
  const PassthroughItem = ({ children, onClick, className }: any) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  );
  const SubTrigger = ({ children }: any) => <button>{children}</button>;
  return {
    DropdownMenu: Passthrough,
    DropdownMenuTrigger: ({ children, asChild }: any) =>
      asChild ? children : <button>{children}</button>,
    DropdownMenuContent: Passthrough,
    DropdownMenuGroup: Passthrough,
    DropdownMenuItem: PassthroughItem,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuSub: Passthrough,
    DropdownMenuSubTrigger: SubTrigger,
    DropdownMenuSubContent: Passthrough,
  };
});

jest.mock("@workspace/ui/components/ui/collapsible", () => ({
  Collapsible: ({ children, defaultOpen }: any) => (
    <div data-state={defaultOpen ? "open" : "closed"}>{children}</div>
  ),
  CollapsibleTrigger: ({ children, asChild }: any) =>
    asChild ? children : <button>{children}</button>,
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("lucide-react", () => {
  const Icon = ({ "aria-hidden": _h, ...props }: any) => (
    <svg data-testid={props["data-testid"]} {...props} />
  );
  return {
    Archive: Icon,
    Bell: Icon,
    ChevronDown: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    Check: Icon,
    Copy: Icon,
    Download: Icon,
    Eye: Icon,
    EllipsisVertical: Icon,
    FileText: Icon,
    FolderInput: Icon,
    Forward: Icon,
    Inbox: Icon,
    Lock: Icon,
    Loader2: Icon,
    MailOpen: Icon,
    CalendarDays: Icon,
    Clock: Icon,
    MapPin: Icon,
    ExternalLink: Icon,
    MoreHorizontal: Icon,
    Paperclip: Icon,
    Pin: Icon,
    Plus: Icon,
    Reply: Icon,
    Send: Icon,
    ShieldAlert: Icon,
    OctagonAlert: Icon,
    ShieldCheck: Icon,
    Smile: Icon,
    Star: Icon,
    Tag: Icon,
    Trash2: Icon,
    X: Icon,
  };
});

jest.mock("../../components/mail/mail-avatar", () => ({
  SenderAvatar: ({ email }: { email: string }) => (
    <div data-testid="sender-avatar">{email[0]?.toUpperCase()}</div>
  ),
}));

jest.mock("../../components/mail/attachment-preview-dialog", () => ({
  PdfAttachmentThumbnail: () => <div data-testid="pdf-thumbnail" />,
}));

jest.mock("../../lib/mail/message-security", () => ({
  classifyMessageEncryption: () => "plain",
  extractMessageBodies: (msg: any) => ({
    text: msg.bodyValues?.["1"]?.value ?? null,
    html: null,
  }),
}));

jest.mock("../../components/mail/mail-helpers", () => ({
  formatAddressFull: (addresses: any[]) =>
    addresses?.map((a: any) => a.email).join(", ") ?? "",
  formatMessageDate: (value: string) => value,
}));

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {
    getEvent: jest.fn(),
    getInvitationByExternalId: jest.fn(),
    importInvitationIcs: jest.fn(),
    declineInvitationIcs: jest.fn(),
    respondToInvitation: jest.fn(),
    deleteEvent: jest.fn(),
  },
}));

import { toast } from "sonner";
import {
  MessageReader,
  type MessageReaderProps,
} from "../../components/mail/message-reader";
import { calendarApiService } from "../../lib/calendar-api-service";

const mockToast = jest.mocked(toast);

const mockCalendarApiService = jest.mocked(calendarApiService);

const baseMessage = {
  id: "msg-1",
  subject: "Hello World",
  from: [{ name: "Alice Smith", email: "alice@example.com" }],
  to: [{ name: "Bob", email: "bob@example.com" }],
  receivedAt: "2024-03-15T10:00:00Z",
  keywords: {},
  bodyValues: { "1": { value: "Hello, this is the message body." } },
};

const defaultProps: MessageReaderProps = {
  message: baseMessage as any,
  plaintext: "Hello, this is the message body.",
  decryptedHtml: null,
  signatureVerificationState: "not_signed",
  decryptError: null,
  accountEncryptedAtRest: false,
  isBusy: false,
  mailboxes: [],
  currentMailboxId: null,
  labels: [],
  onReply: jest.fn(),
  onForward: jest.fn(),
  onDelete: jest.fn(),
  onMove: jest.fn(),
  onMarkAsUnread: jest.fn(),
};

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient();
  mockCalendarApiService.getEvent.mockResolvedValue({
    id: "event-1",
    title: "Planning sync",
    description: "Discuss launch details.",
    start: new Date("2026-05-13T09:00:00Z"),
    end: new Date("2026-05-13T10:00:00Z"),
    allDay: false,
    location: "Room 42",
    calendarId: "cal-1",
    calendar: { id: "cal-1", name: "Work" },
    userId: "user-1",
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
  } as any);
  mockCalendarApiService.getInvitationByExternalId.mockResolvedValue(null);
  mockCalendarApiService.importInvitationIcs.mockResolvedValue({
    messagesScanned: 1,
    icsPartsFound: 1,
    eventsCreated: 1,
    eventsUpdated: 0,
    eventsDeleted: 0,
    errors: [],
  });
  mockCalendarApiService.respondToInvitation.mockResolvedValue({
    id: "event-1",
  } as any);
  mockCalendarApiService.deleteEvent.mockResolvedValue({
    success: true,
    message: "Event deleted successfully",
    deletedEventId: "event-1",
  } as any);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  jest.clearAllMocks();
});

function render(props: Partial<MessageReaderProps> = {}) {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MessageReader {...defaultProps} {...props} />
      </QueryClientProvider>,
    );
  });
}

describe("MessageReader — empty state", () => {
  it("shows placeholder when no message is selected", () => {
    render({ message: null });
    expect(container.textContent).toContain("Select a message to read");
  });
});

describe("MessageReader — email header", () => {
  it("renders subject line", () => {
    render();
    expect(container.textContent).toContain("Hello World");
  });

  it("renders sender avatar", () => {
    render();
    expect(
      container.querySelector("[data-testid='sender-avatar']"),
    ).not.toBeNull();
  });

  it("renders From address", () => {
    render();
    expect(container.textContent).toContain("alice@example.com");
  });

  it("renders To address", () => {
    render();
    // Header shows recipient name (Bob), not raw email, matching the reference design
    expect(container.textContent).toContain("Bob");
  });

  it("renders CC when present", () => {
    render({
      message: {
        ...baseMessage,
        cc: [{ name: "Charlie", email: "charlie@example.com" }],
      } as any,
    });
    // Header shows CC recipient name (Charlie), not raw email, matching the reference design
    expect(container.textContent).toContain("Charlie");
  });

  it("renders (No subject) when subject is empty", () => {
    render({ message: { ...baseMessage, subject: null } as any });
    expect(container.textContent).toContain("(No subject)");
  });
});

describe("MessageReader — linked calendar event", () => {
  it("replaces Solace reminder mail with decrypted event details", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MessageReader
            {...defaultProps}
            message={
              {
                ...baseMessage,
                subject: "Encrypted event in 15 minutes",
                bodyValues: {
                  "1": {
                    value: [
                      "Encrypted event",
                      "",
                      "15 minutes",
                      "When",
                      "Friday, Jun 5 · 2:00 PM - 3:00 PM",
                      "Event ID: event-1",
                      "Open event: https://solace.onl/calendar?eventId=event-1",
                    ].join("\n"),
                  },
                },
              } as any
            }
            plaintext={[
              "Encrypted event",
              "15 minutes",
              "Event ID: event-1",
              "Open event: https://solace.onl/calendar?eventId=event-1",
            ].join("\n")}
          />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const state = queryClient.getQueryState(["events", "detail", "event-1"]);
        if (state?.status === "success") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await Promise.resolve();
    });

    expect(mockCalendarApiService.getEvent).toHaveBeenCalledWith("event-1");
    expect(container.textContent).toContain("Planning sync");
    expect(container.textContent).toContain("Room 42");
    expect(container.textContent).toContain("Work");
    expect(container.textContent).toContain("Open Event");
    expect(container.textContent).toContain("Solace");
    expect(container.textContent).toContain("Open in calendar");
    expect(container.textContent).toContain("15 minutes");
    expect(container.textContent).not.toContain("Linked calendar event");
    expect(container.textContent).not.toContain("Event ID: event-1");
    expect(
      container.querySelector('a[href="/calendar?eventId=event-1"]'),
    ).not.toBeNull();
  });

  it("shows decrypted ICS invitation details without importing before acceptance", async () => {
    const icsContent = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:google-event-1@example.com",
      "DTSTART:20260527T150000Z",
      "DTEND:20260527T160000Z",
      "SUMMARY:testinvite6",
      "LOCATION:google event",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    mockCalendarApiService.getInvitationByExternalId.mockResolvedValueOnce(null);
    const pendingGoogleEvent = {
      id: "event-1",
      title: "testinvite6",
      calendarId: "cal-1",
      userId: "user-1",
      participants: [
        {
          userId: "user-1",
          email: "bob@example.com",
          role: "attendee",
          status: "pending",
        },
      ],
    } as any;
    mockCalendarApiService.getInvitationByExternalId.mockResolvedValueOnce(
      pendingGoogleEvent,
    );

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MessageReader
            {...defaultProps}
            message={
              {
                ...baseMessage,
                subject: "google event",
                bodyValues: {},
              } as any
            }
            plaintext={"Invitation from Google Calendar"}
            attachments={[
              {
                name: "invite.ics",
                type: "text/calendar; method=REQUEST",
                content: icsContent,
              },
            ]}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCalendarApiService.importInvitationIcs).toHaveBeenCalledWith(
      icsContent,
    );
    expect(
      mockCalendarApiService.getInvitationByExternalId,
    ).toHaveBeenCalledWith("google-event-1@example.com", {
      syncRemote: false,
    });
    expect(container.textContent).toContain("testinvite6");
    expect(container.textContent).toContain("Accept");
    expect(mockCalendarApiService.getEvent).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Linked calendar event");
    expect(container.textContent).not.toContain("Unable to load linked event details");
  });

  it("does not fetch organizer event links for Solace ICS invitations", async () => {
    const icsContent = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:event-uid@solace-calendar.local",
      "DTSTART:20260527T150000Z",
      "DTEND:20260527T160000Z",
      "SUMMARY:Planning sync",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    mockCalendarApiService.getInvitationByExternalId.mockResolvedValueOnce(null);
    const pendingSolaceEvent = {
      id: "event-1",
      title: "Planning sync",
      calendarId: "cal-1",
      userId: "user-1",
      participants: [
        {
          userId: "user-1",
          email: "bob@example.com",
          role: "attendee",
          status: "pending",
        },
      ],
    } as any;
    mockCalendarApiService.getInvitationByExternalId.mockResolvedValueOnce(
      pendingSolaceEvent,
    );

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MessageReader
            {...defaultProps}
            message={
              {
                ...baseMessage,
                subject: "Bob invited you to Planning sync",
                bodyValues: {
                  "1": {
                    value: [
                      "Bob invited you to Planning sync on Solace.",
                      "Open event: https://solace.onl/calendar?eventId=organizer-event-1",
                    ].join("\n"),
                  },
                },
              } as any
            }
            plaintext={[
              "Bob invited you to Planning sync on Solace.",
              "Open event: https://solace.onl/calendar?eventId=organizer-event-1",
            ].join("\n")}
            attachments={[
              {
                name: "invite.ics",
                type: "text/calendar; method=REQUEST",
                content: icsContent,
              },
            ]}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCalendarApiService.getEvent).not.toHaveBeenCalled();
    expect(mockCalendarApiService.importInvitationIcs).toHaveBeenCalledWith(
      icsContent,
    );
    expect(container.textContent).not.toContain("Linked calendar event");
    expect(container.textContent).not.toContain("Unable to load linked event details");
    expect(container.textContent).toContain("Planning sync");
    expect(container.textContent).toContain("Accept");
  });

  it("responds to a staged invitation when accepting from mail", async () => {
    const icsContent = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:google-event-1@example.com",
      "DTSTART:20260527T150000Z",
      "DTEND:20260527T160000Z",
      "SUMMARY:testinvite6",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const pendingEvent = {
      id: "event-1",
      title: "testinvite6",
      calendarId: "cal-1",
      userId: "user-1",
      participants: [
        {
          userId: "user-1",
          email: "bob@example.com",
          role: "attendee",
          status: "pending",
        },
      ],
    } as any;
    const acceptedEvent = {
      ...pendingEvent,
      participants: [
        {
          userId: "user-1",
          email: "bob@example.com",
          role: "attendee",
          status: "accepted",
        },
      ],
    } as any;

    mockCalendarApiService.getInvitationByExternalId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pendingEvent);
    mockCalendarApiService.importInvitationIcs.mockResolvedValueOnce({
      messagesScanned: 1,
      icsPartsFound: 1,
      eventsCreated: 0,
      eventsUpdated: 1,
      eventsDeleted: 0,
      errors: [],
    });
    mockCalendarApiService.getInvitationByExternalId.mockResolvedValueOnce(
      acceptedEvent,
    );

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MessageReader
            {...defaultProps}
            message={
              {
                ...baseMessage,
                subject: "google event",
                bodyValues: {},
              } as any
            }
            plaintext={"Invitation from Google Calendar"}
            attachments={[
              {
                name: "invite.ics",
                type: "text/calendar; method=REQUEST",
                content: icsContent,
              },
            ]}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const acceptButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Accept"));
    expect(acceptButton).toBeTruthy();

    await act(async () => {
      acceptButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCalendarApiService.importInvitationIcs).toHaveBeenCalledWith(
      icsContent,
    );
    expect(mockCalendarApiService.importInvitationIcs).toHaveBeenCalledWith(
      icsContent,
      { status: "accepted" },
    );
    expect(mockCalendarApiService.respondToInvitation).not.toHaveBeenCalled();
  });

  it("responds to a synced invitation via RSVP when Stalwart is linked", async () => {
    const icsContent = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:google-event-1@example.com",
      "DTSTART:20260527T150000Z",
      "DTEND:20260527T160000Z",
      "SUMMARY:testinvite6",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const syncedEvent = {
      id: "event-1",
      title: "testinvite6",
      calendarId: "cal-1",
      userId: "user-1",
      stalwartEventId: "remote-event-1",
      participants: [
        {
          userId: "user-1",
          email: "bob@example.com",
          role: "attendee",
          status: "pending",
        },
      ],
    } as any;
    const acceptedEvent = {
      ...syncedEvent,
      participants: [
        {
          userId: "user-1",
          email: "bob@example.com",
          role: "attendee",
          status: "accepted",
        },
      ],
    } as any;

    mockCalendarApiService.getInvitationByExternalId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(syncedEvent);
    mockCalendarApiService.respondToInvitation.mockResolvedValueOnce(
      acceptedEvent,
    );

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MessageReader
            {...defaultProps}
            message={
              {
                ...baseMessage,
                subject: "google event",
                bodyValues: {},
              } as any
            }
            plaintext={"Invitation from Google Calendar"}
            attachments={[
              {
                name: "invite.ics",
                type: "text/calendar; method=REQUEST",
                content: icsContent,
              },
            ]}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const acceptButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Accept"));
    expect(acceptButton).toBeTruthy();

    await act(async () => {
      acceptButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCalendarApiService.respondToInvitation).toHaveBeenCalledWith(
      "event-1",
      "accepted",
    );
    expect(mockCalendarApiService.importInvitationIcs).not.toHaveBeenCalledWith(
      icsContent,
      { status: "accepted" },
    );
  });

  it("auto-processes CANCEL invites for already accepted events", async () => {
    const icsContent = [
      "BEGIN:VCALENDAR",
      "METHOD:CANCEL",
      "BEGIN:VEVENT",
      "UID:google-event-1@example.com",
      "DTSTART:20260527T150000Z",
      "DTEND:20260527T160000Z",
      "SUMMARY:testinvite6",
      "LOCATION:google event",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    mockCalendarApiService.getInvitationByExternalId
      .mockResolvedValueOnce({
        id: "event-1",
        title: "testinvite6",
        description: null,
        start: new Date("2026-05-27T15:00:00Z"),
        end: new Date("2026-05-27T16:00:00Z"),
        allDay: false,
        location: "google event",
        calendarId: "cal-1",
        calendar: { id: "cal-1", name: "Work" },
        userId: "user-1",
        participants: [
          {
            userId: "user-1",
            email: "bob@example.com",
            role: "attendee",
            status: "accepted",
          },
        ],
        createdAt: new Date("2026-05-01T00:00:00Z"),
        updatedAt: new Date("2026-05-01T00:00:00Z"),
      } as any)
      .mockResolvedValueOnce({
        id: "event-1",
        title: "testinvite6",
        description: null,
        start: new Date("2026-05-27T15:00:00Z"),
        end: new Date("2026-05-27T16:00:00Z"),
        allDay: false,
        location: "google event",
        calendarId: "cal-1",
        calendar: { id: "cal-1", name: "Work" },
        userId: "user-1",
        isCancelled: true,
        participants: [
          {
            userId: "user-1",
            email: "bob@example.com",
            role: "attendee",
            status: "accepted",
          },
        ],
        createdAt: new Date("2026-05-01T00:00:00Z"),
        updatedAt: new Date("2026-05-01T00:00:00Z"),
      } as any);
    mockCalendarApiService.importInvitationIcs.mockResolvedValueOnce({
      messagesScanned: 1,
      icsPartsFound: 1,
      eventsCreated: 0,
      eventsUpdated: 1,
      eventsDeleted: 0,
      errors: [],
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MessageReader
            {...defaultProps}
            message={
              {
                ...baseMessage,
                subject: "google event cancelled",
                bodyValues: {},
              } as any
            }
            plaintext={"Cancellation from Google Calendar"}
            attachments={[
              {
                name: "cancel.ics",
                type: "text/calendar; method=CANCEL",
                content: icsContent,
              },
            ]}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCalendarApiService.importInvitationIcs).toHaveBeenCalledWith(
      icsContent,
    );
    expect(
      mockCalendarApiService.getInvitationByExternalId,
    ).toHaveBeenNthCalledWith(1, "google-event-1@example.com", {
      syncRemote: false,
    });
    expect(
      mockCalendarApiService.getInvitationByExternalId,
    ).toHaveBeenNthCalledWith(2, "google-event-1@example.com", {
      syncRemote: false,
    });
    expect(container.textContent).toContain("The organiser cancelled this event");
    expect(container.textContent).toContain("Remove from calendar");
  });
});

describe("MessageReader — toolbar navigation", () => {
  it("renders Previous message button", () => {
    render({ navigation: { hasPrev: true }, onNavigatePrev: jest.fn() });
    const btn = container.querySelector("[aria-label='Previous message']");
    expect(btn).not.toBeNull();
  });

  it("renders Next message button", () => {
    render({ navigation: { hasNext: true }, onNavigateNext: jest.fn() });
    const btn = container.querySelector("[aria-label='Next message']");
    expect(btn).not.toBeNull();
  });

  it("calls onNavigatePrev when Previous button is clicked", () => {
    const onNavigatePrev = jest.fn();
    render({ navigation: { hasPrev: true }, onNavigatePrev });
    const btn = container.querySelector(
      "[aria-label='Previous message']",
    ) as HTMLButtonElement;
    act(() => {
      btn.click();
    });
    expect(onNavigatePrev).toHaveBeenCalledTimes(1);
  });

  it("calls onNavigateNext when Next button is clicked", () => {
    const onNavigateNext = jest.fn();
    render({ navigation: { hasNext: true }, onNavigateNext });
    const btn = container.querySelector(
      "[aria-label='Next message']",
    ) as HTMLButtonElement;
    act(() => {
      btn.click();
    });
    expect(onNavigateNext).toHaveBeenCalledTimes(1);
  });

  it("disables Previous button when hasPrev is false", () => {
    render({ navigation: { hasPrev: false }, onNavigatePrev: jest.fn() });
    const btn = container.querySelector(
      "[aria-label='Previous message']",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("disables Next button when hasNext is false", () => {
    render({ navigation: { hasNext: false }, onNavigateNext: jest.fn() });
    const btn = container.querySelector(
      "[aria-label='Next message']",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("MessageReader — close button", () => {
  it("renders Close button when onClose is provided", () => {
    render({ onClose: jest.fn() });
    const btn = container.querySelector("[aria-label='Close message']");
    expect(btn).not.toBeNull();
  });

  it("calls onClose when Close button is clicked", () => {
    const onClose = jest.fn();
    render({ onClose });
    const btn = container.querySelector(
      "[aria-label='Close message']",
    ) as HTMLButtonElement;
    act(() => {
      btn.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render Close button when onClose is not provided", () => {
    render({ onClose: undefined });
    expect(container.querySelector("[aria-label='Close message']")).toBeNull();
  });
});

describe("MessageReader — archive button", () => {
  it("renders Archive button when onArchive is provided", () => {
    render({ onArchive: jest.fn() });
    const btn = container.querySelector("[aria-label='Archive message']");
    expect(btn).not.toBeNull();
  });

  it("calls onArchive when Archive button is clicked", () => {
    const onArchive = jest.fn();
    render({ onArchive });
    const btn = container.querySelector(
      "[aria-label='Archive message']",
    ) as HTMLButtonElement;
    act(() => {
      btn.click();
    });
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("does not render Archive button when onArchive is not provided", () => {
    render({ onArchive: undefined });
    expect(
      container.querySelector("[aria-label='Archive message']"),
    ).toBeNull();
  });
});

describe("MessageReader — reply button in toolbar", () => {
  it("renders Reply button in toolbar", () => {
    render();
    const btn = container.querySelector("[aria-label='Reply']");
    expect(btn).not.toBeNull();
  });

  it("calls onReply when Reply button is clicked", () => {
    const onReply = jest.fn();
    render({ onReply });
    const btn = container.querySelector(
      "[aria-label='Reply']",
    ) as HTMLButtonElement;
    act(() => {
      btn.click();
    });
    expect(onReply).toHaveBeenCalledTimes(1);
  });
});

describe("MessageReader — delete dropdown", () => {
  it("renders Move to trash button", () => {
    render();
    const btn = container.querySelector("[aria-label='Move to trash']");
    expect(btn).not.toBeNull();
  });

  it("calls onDelete when 'Move to trash' button is clicked", () => {
    const onDelete = jest.fn();
    render({ onDelete });
    const btn = container.querySelector(
      "[aria-label='Move to trash']",
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    act(() => {
      btn.click();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe("MessageReader — more actions dropdown", () => {
  it("renders More actions button", () => {
    render();
    const btn = container.querySelector("[aria-label='More actions']");
    expect(btn).not.toBeNull();
  });

  it("calls onForward when Forward is clicked", () => {
    const onForward = jest.fn();
    render({ onForward });
    const forwardButtons = Array.from(
      container.querySelectorAll("button"),
    ).filter((b) => b.textContent?.includes("Forward"));
    expect(forwardButtons.length).toBeGreaterThan(0);
    act(() => {
      forwardButtons[0].click();
    });
    expect(onForward).toHaveBeenCalledTimes(1);
  });

  it("calls onMarkAsUnread when Mark as unread is clicked", () => {
    const onMarkAsUnread = jest.fn();
    render({ onMarkAsUnread });
    const buttons = Array.from(container.querySelectorAll("button")).filter(
      (b) =>
        b.textContent?.includes("Unread") ||
        b.textContent?.includes("Mark as unread"),
    );
    expect(buttons.length).toBeGreaterThan(0);
    act(() => {
      buttons[0].click();
    });
    expect(onMarkAsUnread).toHaveBeenCalledTimes(1);
  });

  it("shows Move to mailbox options when otherMailboxes exist", () => {
    render({
      mailboxes: [
        { id: "inbox", name: "Inbox", role: "inbox" } as any,
        { id: "archive", name: "Archive", role: "archive" } as any,
      ],
      currentMailboxId: "inbox",
    });
    // Open the "More actions" popover
    const moreBtn = container.querySelector(
      '[aria-label="More actions"]',
    ) as HTMLElement | null;
    expect(moreBtn).not.toBeNull();
    act(() => {
      moreBtn!.click();
    });

    // Expand the "Move to" section
    const moveToBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Move to"),
    ) as HTMLElement | undefined;
    expect(moveToBtn).toBeDefined();
    act(() => {
      moveToBtn!.click();
    });

    expect(document.body.textContent).toContain("Archive");
  });
});

describe("MessageReader — attachments", () => {
  it("shows attachments section when message has attachments", () => {
    render({
      message: {
        ...baseMessage,
        attachments: [
          { name: "report.pdf", type: "application/pdf" },
          { name: "photo.jpg", type: "image/jpeg" },
        ],
      } as any,
    });
    expect(container.textContent).toContain("Attachments");
    expect(container.textContent).toContain("report.pdf");
    expect(container.textContent).toContain("photo.jpg");
  });

  it("shows file extension from MIME type", () => {
    render({
      message: {
        ...baseMessage,
        attachments: [{ name: "document.pdf", type: "application/pdf" }],
      } as any,
    });
    expect(container.textContent).toContain("PDF");
  });

  it("does not show attachments section when there are no attachments", () => {
    render({ message: { ...baseMessage, attachments: [] } as any });
    expect(container.textContent).not.toContain("Attachments (");
  });

  it("handles attachments with missing name gracefully", () => {
    render({
      message: {
        ...baseMessage,
        attachments: [{ name: null, type: "image/png" }],
      } as any,
    });
    expect(container.textContent).toContain("Attachment");
  });

  it("prefers decrypted attachments over raw PGP control parts", () => {
    render({
      message: {
        ...baseMessage,
        attachments: [
          { name: "Attachment", type: "application/pgp-encrypted" },
          { name: "encrypted.asc", type: "application/octet-stream" },
        ],
      } as any,
      attachments: [{ name: "forwarded.pdf", type: "application/pdf" }],
    });

    expect(container.textContent).toContain("forwarded.pdf");
    expect(container.textContent).not.toContain("encrypted.asc");
    expect(container.textContent).not.toContain("PGP-ENCRYPTED");
  });

  it("can hide raw PGP control parts while decrypted attachments load", () => {
    render({
      message: {
        ...baseMessage,
        attachments: [
          { name: "Attachment", type: "application/pgp-encrypted" },
          { name: "encrypted.asc", type: "application/octet-stream" },
        ],
      } as any,
      attachments: [],
    });

    expect(container.textContent).not.toContain("Attachments (");
    expect(container.textContent).not.toContain("encrypted.asc");
  });

  it("shows preview and download actions for PDF attachments", () => {
    const onPreviewAttachment = jest.fn();
    const onDownloadAttachment = jest.fn();
    render({
      message: baseMessage as any,
      attachments: [
        { name: "document.pdf", type: "application/pdf", content: "pdf-data" },
      ],
      onPreviewAttachment,
      onDownloadAttachment,
    });

    const previewButton = container.querySelector(
      "button[aria-label='Preview document.pdf']",
    ) as HTMLButtonElement | null;
    expect(previewButton).not.toBeNull();
    expect(
      container.querySelector("button[aria-label='Download document.pdf']"),
    ).not.toBeNull();

    act(() => {
      previewButton!.click();
    });

    expect(onPreviewAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ name: "document.pdf" }),
    );
  });

  it("does not crash when a PDF hover preview has not loaded yet", () => {
    const onLoadAttachmentPreview: NonNullable<
      MessageReaderProps["onLoadAttachmentPreview"]
    > = jest.fn(async () => null);

    render({
      message: baseMessage as any,
      attachments: [
        { name: "document.pdf", type: "application/pdf", content: "pdf-data" },
      ],
      onPreviewAttachment: jest.fn(),
      onLoadAttachmentPreview,
      onDownloadAttachment: jest.fn(),
    });

    expect(container.textContent).toContain("document.pdf");
  });

  it("does not show a preview action for non-previewable attachments", () => {
    render({
      message: {
        ...baseMessage,
        attachments: [
          { name: "archive.zip", type: "application/zip", blobId: "blob-1" },
        ],
      } as any,
      onPreviewAttachment: jest.fn(),
      onDownloadAttachment: jest.fn(),
    });

    expect(
      container.querySelector("button[aria-label='Preview archive.zip']"),
    ).toBeNull();
    expect(
      container.querySelector("button[aria-label='Download archive.zip']"),
    ).not.toBeNull();
  });
});

describe("MessageReader — reply bar", () => {
  /** Helper: expand the reply bar by clicking the collapsed pill. */
  function expandReplyBar() {
    // Find the pill button (always in DOM in new implementation)
    // The pill button has aria-label starting with "Reply to"
    const pillBtn = container.querySelector(
      "button[aria-label*='Reply to']",
    ) as HTMLButtonElement | null;
    if (pillBtn) {
      act(() => {
        pillBtn.click();
      });
    }
  }

  it("renders collapsed reply pill when a message is selected", () => {
    render();
    // Pill is always in DOM — find by aria-label
    const pillBtn = container.querySelector("button[aria-label*='Reply to']");
    expect(pillBtn).not.toBeNull();
  });

  it("renders reply textarea after expanding the reply bar", () => {
    render();
    expandReplyBar();
    const textarea = container.querySelector(
      "textarea[aria-label*='Reply to']",
    ) as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
  });

  it("shows sender name in reply bar aria-label", () => {
    render();
    expandReplyBar();
    const textarea = container.querySelector(
      "textarea[aria-label*='Alice Smith']",
    ) as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
  });

  it("accepts text input in reply bar", () => {
    render();
    expandReplyBar();
    const textarea = container.querySelector(
      "textarea[aria-label*='Reply to']",
    ) as HTMLTextAreaElement;
    act(() => {
      textarea.value = "Hello there";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(textarea.value).toBe("Hello there");
  });

  it("pressing Ctrl+Enter in reply bar calls onReply", () => {
    const onReply = jest.fn();
    render({ onReply });
    expandReplyBar();
    const textarea = container.querySelector(
      "textarea[aria-label*='Reply to']",
    ) as HTMLTextAreaElement;
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it("plain Enter in reply bar does not send", () => {
    const onReply = jest.fn();
    render({ onReply });
    expandReplyBar();
    const textarea = container.querySelector(
      "textarea[aria-label*='Reply to']",
    ) as HTMLTextAreaElement;
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("clicking Send button in reply bar calls onReply", () => {
    const onReply = jest.fn();
    render({ onReply });
    expandReplyBar();
    const sendBtn = container.querySelector(
      "[aria-label='Send reply']",
    ) as HTMLButtonElement;
    act(() => {
      sendBtn.click();
    });
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it("shows error toast when onSendReply rejects", async () => {
    const onSendReply = jest
      .fn<(text: string, files: File[]) => Promise<void>>()
      .mockRejectedValue(new Error("Network error"));
    render({ onSendReply });
    expandReplyBar();
    const textarea = container.querySelector(
      "textarea[aria-label*='Reply to']",
    ) as HTMLTextAreaElement;
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    act(() => {
      nativeValueSetter?.call(textarea, "Thanks for the update");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const sendBtn = container.querySelector(
      "[aria-label='Send reply']",
    ) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(false);
    await act(async () => {
      sendBtn.click();
      await Promise.resolve();
    });
    expect(onSendReply).toHaveBeenCalledWith("Thanks for the update", []);
    expect(mockToast.error).toHaveBeenCalledWith("Network error");
  });

  it("clears the typed reply when switching to another message", () => {
    render();
    expandReplyBar();
    const textarea = container.querySelector(
      "textarea[aria-label*='Reply to']",
    ) as HTMLTextAreaElement;

    act(() => {
      textarea.value = "Draft reply";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    render({
      message: {
        ...baseMessage,
        id: "msg-2",
        subject: "Another message",
        from: [{ name: "Carol Example", email: "carol@example.com" }],
      } as any,
    });

    const nextTextarea = container.querySelector(
      "textarea[aria-label*='Reply to Carol Example']",
    ) as HTMLTextAreaElement;
    expect(nextTextarea.value).toBe("");
    expect(container.textContent).toContain("Reply to Carol Example");
  });
});

describe("MessageReader — pin / star", () => {
  it("shows star button when onToggleFlagged is provided", () => {
    render({ onToggleFlagged: jest.fn() });
    // Pin button removed from toolbar; star is in the header
    const starBtn = container.querySelector("[aria-label='Star']");
    expect(starBtn).not.toBeNull();
  });

  it("shows 'Unstar' label when message is flagged", () => {
    render({
      onToggleFlagged: jest.fn(),
      message: {
        ...baseMessage,
        keywords: { $flagged: true },
      } as any,
    });
    const starBtn = container.querySelector("[aria-label='Unstar']");
    expect(starBtn).not.toBeNull();
  });

  it("calls onToggleFlagged when star button is clicked", () => {
    const onToggleFlagged = jest.fn();
    render({ onToggleFlagged });
    const starBtn = container.querySelector(
      "[aria-label='Star']",
    ) as HTMLButtonElement;
    act(() => {
      starBtn.click();
    });
    expect(onToggleFlagged).toHaveBeenCalledTimes(1);
  });

  it("updates star state when message keywords change", () => {
    render({
      onToggleFlagged: jest.fn(),
      message: { ...baseMessage, keywords: {} } as any,
    });
    expect(container.querySelector("[aria-label='Star']")).not.toBeNull();

    render({
      onToggleFlagged: jest.fn(),
      message: {
        ...baseMessage,
        keywords: { $flagged: true },
      } as any,
    });
    expect(container.querySelector("[aria-label='Unstar']")).not.toBeNull();
  });
});

describe("MessageReader — labels", () => {
  it("renders assigned label badges", () => {
    render({
      labels: [{ id: "l1", name: "Important", color: "#ff0000" }],
      message: {
        ...baseMessage,
        keywords: { "label:l1": true },
      } as any,
    });
    expect(container.textContent).toContain("Important");
  });
});

describe("MessageReader — message body", () => {
  it("renders plaintext body", () => {
    render({ plaintext: "This is the email content." });
    expect(container.textContent).toContain("This is the email content.");
  });

  it("renders 'No message body' when body is empty", () => {
    render({
      plaintext: null,
      message: { ...baseMessage, bodyValues: {} } as any,
    });
    expect(container.textContent).toContain("No message body");
  });
});

describe("MessageReader — untrash / restore", () => {
  const trashMailboxes = [
    { id: "trash", name: "Trash", role: "trash" } as any,
    { id: "inbox", name: "Inbox", role: "inbox" } as any,
  ];
  const spamMailboxes = [
    { id: "junk", name: "Junk", role: "junk" } as any,
    { id: "inbox", name: "Inbox", role: "inbox" } as any,
  ];

  it("shows 'Restore to inbox' in dropdown when in trash", () => {
    render({
      mailboxes: trashMailboxes,
      currentMailboxId: "trash",
      onUntrash: jest.fn(),
    });
    expect(container.textContent).toContain("Restore to inbox");
  });

  it("shows 'Not spam' in dropdown when in spam folder", () => {
    render({
      mailboxes: spamMailboxes,
      currentMailboxId: "junk",
      onUntrash: jest.fn(),
    });
    expect(container.textContent).toContain("Not spam");
  });

  it("calls onUntrash when 'Restore to inbox' is clicked", () => {
    const onUntrash = jest.fn();
    render({
      mailboxes: trashMailboxes,
      currentMailboxId: "trash",
      onUntrash,
    });
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Restore to inbox"),
    ) as HTMLButtonElement;
    expect(btn).not.toBeUndefined();
    act(() => {
      btn.click();
    });
    expect(onUntrash).toHaveBeenCalledTimes(1);
  });

  it("does not show restore button when onUntrash is not provided", () => {
    render({
      mailboxes: trashMailboxes,
      currentMailboxId: "trash",
    });
    expect(container.textContent).not.toContain("Restore to inbox");
  });

  it("shows 'Delete permanently' trash button label when in trash mailbox", () => {
    render({
      mailboxes: trashMailboxes,
      currentMailboxId: "trash",
    });
    const btn = container.querySelector("[aria-label='Delete permanently']");
    expect(btn).not.toBeNull();
  });

  it("shows 'Move to trash' trash button label when not in trash mailbox", () => {
    render({
      mailboxes: [{ id: "inbox", name: "Inbox", role: "inbox" } as any],
      currentMailboxId: "inbox",
    });
    const btn = container.querySelector("[aria-label='Move to trash']");
    expect(btn).not.toBeNull();
  });
});
