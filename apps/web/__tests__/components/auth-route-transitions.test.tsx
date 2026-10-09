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

const mockNextRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  prefetch: jest.fn(),
  refresh: jest.fn(),
};
let mockAuthNavigationPending = false;

function MockContainer({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

jest.mock("next/navigation", () => ({
  useRouter: () => mockNextRouter,
  usePathname: () => globalThis.window.location.pathname,
  useSearchParams: () => new URLSearchParams(globalThis.window.location.search),
}));

jest.mock("@/lib/auth-client", () => ({ useSession: jest.fn() }));
jest.mock("@/lib/auth-navigation", () => ({
  completeAuthNavigation: jest.fn(),
  isAuthNavigationPending: () => mockAuthNavigationPending,
  beginAuthNavigation: (href: string) => {
    if (mockAuthNavigationPending) return null;
    mockAuthNavigationPending = true;
    return () => mockCompleteAuthNavigation(href);
  },
}));
jest.mock("@/lib/auth-local-state", () => ({
  signOutAndClearLocalState: jest.fn(),
}));
jest.mock("@workspace/ui/hooks", () => ({
  usePrefersReducedMotion: () => true,
  useIsMobile: () => false,
}));
jest.mock("@workspace/ui/lib/gsap", () => ({ gsap: {}, useGSAP: () => {} }));
jest.mock("lucide-react", () => ({
  CalendarDays: () => null,
  Mail: () => null,
  ChevronRight: () => null,
  LogOut: () => null,
}));
jest.mock("@workspace/ui/components/layout", () => ({
  Logo: () => null,
  ThemeToggle: () => null,
  AppSidebar: () => null,
}));
jest.mock("@workspace/ui/components/ui", () => ({
  FORCE_LOADING_DESIGN_PREVIEW: false,
  PageLoadingOverlay: ({ isLoading }: { isLoading: boolean }) =>
    isLoading ? <div data-testid="loading-overlay">Loading</div> : null,
  DashboardSkeleton: () => <div>Loading calendar</div>,
  SidebarProvider: MockContainer,
  SidebarInset: MockContainer,
}));
jest.mock("@workspace/ui/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));
jest.mock("@workspace/ui/components/ui/tooltip", () => ({
  SimpleTooltip: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
jest.mock("@/components/landing/wallpaper-backdrop", () => ({
  WallpaperBackdrop: () => null,
}));
jest.mock("@/components/landing/landing-navbar", () => ({
  LandingNavbar: () => null,
}));
jest.mock("@/components/landing/landing-sign-in-button", () => ({
  LandingSignInButton: () => null,
}));
jest.mock("@workspace/ui/components", () => ({
  MobileCalendarWrapper: () => null,
}));
jest.mock("@workspace/ui/components/calendar", () => ({
  useCalendarContext: jest.fn(),
}));
jest.mock("@/components/command-palette", () => ({
  CommandPalette: () => null,
}));
jest.mock("@/components/command-palette-context", () => ({
  CommandPaletteProvider: MockContainer,
  useCommandPalette: () => ({
    openCalendarManagement: jest.fn(),
    openPalette: jest.fn(),
    openSearchPalette: jest.fn(),
    openEventEditor: jest.fn(),
  }),
}));
jest.mock("@/components/calendar-data-provider", () => ({
  CalendarDataProvider: MockContainer,
  CalendarDateSync: () => null,
  useSharedCalendarData: () => ({ calendars: [], events: [] }),
}));
jest.mock("@/components/calendar-provider-wrapper", () => ({
  CalendarProviderWrapper: MockContainer,
}));
jest.mock("@/components/calendar-with-data", () => ({
  CalendarWithData: () => null,
}));
jest.mock("@/components/settings-provider", () => ({
  SettingsProvider: MockContainer,
}));
jest.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ settings: null }),
}));
jest.mock("@/hooks/use-calendar-presentation", () => ({
  useCalendarPresentation: jest.fn(),
}));
jest.mock("@/hooks/use-recurring-move-prompt", () => ({
  useRecurringMovePrompt: jest.fn(),
}));
jest.mock("@/hooks/use-calendar-url-sync", () => ({
  useCalendarUrlSync: () => {},
}));
jest.mock("@/components/command-palette/recurring-scope-modal", () => ({
  RecurringScopeModal: () => null,
}));
jest.mock("@/components/mobile-app-switcher", () => ({
  MobileAppSwitcher: () => null,
}));

import { useSession } from "@/lib/auth-client";
import { completeAuthNavigation } from "@/lib/auth-navigation";
import { signOutAndClearLocalState } from "@/lib/auth-local-state";
import { CalendarShell } from "@/app/calendar/_client";
import { HomeAppClient } from "@/app/home/home-client";
import { HomePageClient } from "@/app/home-page-client";
import { RouteTransitionProvider } from "@/components/route-transition-provider";
import { authSessionDataFixture } from "../mocks/auth-session";

const mockUseSession = jest.mocked(useSession);
const mockCompleteAuthNavigation = jest.mocked(completeAuthNavigation);
const mockSignOutAndClearLocalState = jest.mocked(signOutAndClearLocalState);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function setSession(
  data: ReturnType<typeof useSession>["data"],
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

describe("auth redirects with route transitions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockAuthNavigationPending = false;
    jest.useFakeTimers();
    window.history.replaceState(null, "", "/home");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockCompleteAuthNavigation.mockReset();
    mockCompleteAuthNavigation.mockImplementation(() => {
      // Stop a broken passive-effect loop before it can hang the test runner.
      if (mockCompleteAuthNavigation.mock.calls.length > 3) {
        throw new Error(
          "Auth navigation repeated before the page could unload",
        );
      }
    });
    mockSignOutAndClearLocalState.mockReset();
    setSession(authSessionDataFixture);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  function renderPage(page: React.ReactNode, strict = false) {
    const content = <RouteTransitionProvider>{page}</RouteTransitionProvider>;
    act(() =>
      root.render(
        strict ? <React.StrictMode>{content}</React.StrictMode> : content,
      ),
    );
  }

  it("redirects once when the home session disappears on logout", () => {
    renderPage(<HomeAppClient />);
    expect(mockCompleteAuthNavigation).not.toHaveBeenCalled();

    setSession(null);
    renderPage(<HomeAppClient />);

    expect(mockCompleteAuthNavigation).toHaveBeenCalledTimes(1);
    expect(mockCompleteAuthNavigation).toHaveBeenCalledWith("/login");
    expect(
      container.querySelector('[data-testid="loading-overlay"]'),
    ).not.toBeNull();

    renderPage(<HomeAppClient />);
    expect(mockCompleteAuthNavigation).toHaveBeenCalledTimes(1);
  });

  it("waits for the session check before redirecting an unauthenticated visitor", () => {
    setSession(null, true);
    renderPage(<HomeAppClient />);
    expect(mockCompleteAuthNavigation).not.toHaveBeenCalled();

    setSession(null);
    renderPage(<HomeAppClient />);
    expect(mockCompleteAuthNavigation).toHaveBeenCalledTimes(1);
  });

  it("completes a pending home logout in Strict Mode without restarting the redirect", async () => {
    let finishSignOut = () => {};
    mockSignOutAndClearLocalState.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSignOut = resolve;
      }),
    );
    renderPage(<HomeAppClient />, true);
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sign out"]',
    );
    if (!button) throw new Error("Missing sign-out button");

    act(() => button.click());
    expect(mockSignOutAndClearLocalState).toHaveBeenCalledTimes(1);
    expect(mockCompleteAuthNavigation).not.toHaveBeenCalled();

    setSession(null);
    renderPage(<HomeAppClient />, true);
    expect(mockCompleteAuthNavigation).not.toHaveBeenCalled();

    await act(async () => finishSignOut());
    expect(mockCompleteAuthNavigation.mock.calls).toEqual([["/login"]]);
    renderPage(<HomeAppClient />, true);
    expect(mockCompleteAuthNavigation).toHaveBeenCalledTimes(1);
  });

  it("still redirects after a second session loss following a new sign-in", () => {
    renderPage(<HomeAppClient />);
    setSession(null);
    renderPage(<HomeAppClient />);

    setSession(authSessionDataFixture);
    renderPage(<HomeAppClient />);
    setSession(null);
    renderPage(<HomeAppClient />);

    expect(mockCompleteAuthNavigation.mock.calls).toEqual([
      ["/login"],
      ["/login"],
    ]);
  });

  it("redirects Calendar once on logout in Strict Mode and preserves the current URL", () => {
    window.history.replaceState(null, "", "/calendar?view=week");
    renderPage(
      <CalendarShell>
        <div>Calendar content</div>
      </CalendarShell>,
      true,
    );
    expect(mockCompleteAuthNavigation).not.toHaveBeenCalled();

    setSession(null);
    renderPage(
      <CalendarShell>
        <div>Calendar content</div>
      </CalendarShell>,
      true,
    );
    expect(mockCompleteAuthNavigation.mock.calls).toEqual([
      ["/login?next=%2Fcalendar%3Fview%3Dweek"],
    ]);
    renderPage(
      <CalendarShell>
        <div>Calendar content</div>
      </CalendarShell>,
      true,
    );
    expect(mockCompleteAuthNavigation).toHaveBeenCalledTimes(1);
  });

  it("waits for Calendar auth to resolve and keeps deep links in the login return URL", () => {
    window.history.replaceState(null, "", "/calendar?eventId=event-1");
    setSession(null, true);
    renderPage(
      <CalendarShell>
        <div>Calendar content</div>
      </CalendarShell>,
    );
    expect(mockCompleteAuthNavigation).not.toHaveBeenCalled();

    setSession(null);
    renderPage(
      <CalendarShell>
        <div>Calendar content</div>
      </CalendarShell>,
    );
    expect(mockCompleteAuthNavigation.mock.calls).toEqual([
      ["/login?next=%2Fcalendar%3FeventId%3Devent-1"],
    ]);
  });

  it("redirects an authenticated landing-page visitor once while navigation is pending", () => {
    window.history.replaceState(null, "", "/");
    renderPage(<HomePageClient />);

    expect(mockCompleteAuthNavigation).toHaveBeenCalledTimes(1);
    expect(mockCompleteAuthNavigation).toHaveBeenCalledWith("/home");

    setSession({
      ...authSessionDataFixture,
      user: { ...authSessionDataFixture.user },
    });
    renderPage(<HomePageClient />);
    expect(mockCompleteAuthNavigation).toHaveBeenCalledTimes(1);
  });

  it("shows the public landing page after logout without redirecting", () => {
    setSession(null);
    window.history.replaceState(null, "", "/");
    renderPage(<HomePageClient />);

    expect(mockCompleteAuthNavigation).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Calendar and mail");
  });
});
