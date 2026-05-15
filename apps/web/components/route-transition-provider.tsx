"use client";

import {
  Suspense,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  use,
  type ComponentProps,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";

type RouteLoadingMessageContext = NonNullable<
  ComponentProps<typeof PageLoadingOverlay>["messageContext"]
>;

export interface RouteTransitionOptions {
  messageContext?: RouteLoadingMessageContext;
  minimumVisibleMs?: number;
  onlyIfInactive?: boolean;
}

interface RouteTransitionContextValue {
  isRouteTransitionActive: boolean;
  startRouteTransition: (options?: RouteTransitionOptions) => void;
  finishRouteTransition: () => void;
}

interface OverlayState {
  mounted: boolean;
  active: boolean;
  messageContext: RouteLoadingMessageContext;
  startedAt: number;
  minimumVisibleMs: number;
}

const DEFAULT_MESSAGE_CONTEXT: RouteLoadingMessageContext = "PAGE_LOAD";
const DEFAULT_MINIMUM_VISIBLE_MS = 140;
const ROUTE_OVERLAY_FADE_MS = 180;
const OVERLAY_EXIT_MS = ROUTE_OVERLAY_FADE_MS;
const PASSKEY_BRIDGE_ROUTE = "/passkey/native";

const RouteTransitionContext = createContext<
  RouteTransitionContextValue | undefined
>(undefined);

function RouteTransitionRouteTracker({
  onRouteKeyChange,
}: {
  onRouteKeyChange: (routeKey: string) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(() => {
    const search = searchParams.toString();
    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    onRouteKeyChange(routeKey);
  }, [onRouteKeyChange, routeKey]);

  return null;
}

function isPasskeyBridgeRoute(routeKey: string | null) {
  return routeKey === PASSKEY_BRIDGE_ROUTE || routeKey?.startsWith(`${PASSKEY_BRIDGE_ROUTE}?`);
}

export function RouteTransitionProvider({ children }: { children: ReactNode }) {
  const [routeKey, setRouteKey] = useState<string | null>(null);
  const currentRouteKeyRef = useRef<string | null>(null);
  const previousRouteKeyRef = useRef<string | null>(null);
  const didHydrateRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const unmountTimerRef = useRef<number | null>(null);
  const firstFrameRef = useRef<number | null>(null);
  const secondFrameRef = useRef<number | null>(null);
  const [overlayState, setOverlayState] = useState<OverlayState>({
    mounted: false,
    active: false,
    messageContext: DEFAULT_MESSAGE_CONTEXT,
    startedAt: 0,
    minimumVisibleMs: DEFAULT_MINIMUM_VISIBLE_MS,
  });
  const handleRouteKeyChange = useCallback((nextRouteKey: string) => {
    setRouteKey((currentRouteKey) =>
      currentRouteKey === nextRouteKey ? currentRouteKey : nextRouteKey,
    );
  }, []);
  const isPasskeyBridge = isPasskeyBridgeRoute(routeKey);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
    if (firstFrameRef.current !== null) {
      window.cancelAnimationFrame(firstFrameRef.current);
      firstFrameRef.current = null;
    }
    if (secondFrameRef.current !== null) {
      window.cancelAnimationFrame(secondFrameRef.current);
      secondFrameRef.current = null;
    }
  }, []);

  const startRouteTransition = useCallback(
    (options: RouteTransitionOptions = {}) => {
      clearTimers();

      setOverlayState((previous) => {
        if (options.onlyIfInactive && previous.mounted && previous.active) {
          return previous;
        }

        return {
          mounted: true,
          active: true,
          messageContext:
            options.messageContext ??
            (previous.active
              ? previous.messageContext
              : DEFAULT_MESSAGE_CONTEXT),
          startedAt: Date.now(),
          minimumVisibleMs:
            options.minimumVisibleMs ?? DEFAULT_MINIMUM_VISIBLE_MS,
        };
      });
    },
    [clearTimers],
  );

  const finishRouteTransition = useCallback(() => {
    clearTimers();

    setOverlayState((previous) => {
      if (!previous.mounted) {
        return previous;
      }

      const elapsedMs = Date.now() - previous.startedAt;
      const remainingMs = Math.max(previous.minimumVisibleMs - elapsedMs, 0);

      if (remainingMs > 0) {
        hideTimerRef.current = window.setTimeout(() => {
          setOverlayState((current) =>
            current.active ? { ...current, active: false } : current,
          );
        }, remainingMs);
        return previous;
      }

      return previous.active ? { ...previous, active: false } : previous;
    });
  }, [clearTimers]);

  useEffect(() => {
    if (routeKey === null) {
      return;
    }

    currentRouteKeyRef.current = routeKey;
  }, [routeKey]);

  useEffect(() => {
    if (!overlayState.mounted || overlayState.active) {
      return;
    }

    unmountTimerRef.current = window.setTimeout(() => {
      setOverlayState((current) =>
        current.active ? current : { ...current, mounted: false },
      );
    }, OVERLAY_EXIT_MS);

    return () => {
      if (unmountTimerRef.current !== null) {
        window.clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
    };
  }, [overlayState.active, overlayState.mounted]);

  useEffect(() => {
    if (routeKey === null) {
      return;
    }

    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      previousRouteKeyRef.current = routeKey;
      return;
    }

    const previousRouteKey = previousRouteKeyRef.current;
    previousRouteKeyRef.current = routeKey;

    if (!overlayState.mounted || previousRouteKey === routeKey) {
      return;
    }

    firstFrameRef.current = window.requestAnimationFrame(() => {
      secondFrameRef.current = window.requestAnimationFrame(() => {
        finishRouteTransition();
      });
    });

    return () => {
      if (firstFrameRef.current !== null) {
        window.cancelAnimationFrame(firstFrameRef.current);
        firstFrameRef.current = null;
      }
      if (secondFrameRef.current !== null) {
        window.cancelAnimationFrame(secondFrameRef.current);
        secondFrameRef.current = null;
      }
    };
  }, [finishRouteTransition, overlayState.mounted, routeKey]);

  useEffect(() => {
    if (isPasskeyBridge) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (anchor.target && anchor.target !== "_self" && anchor.target !== "") {
        return;
      }

      if (
        anchor.hasAttribute("download") ||
        anchor.getAttribute("rel")?.includes("external") ||
        anchor.dataset.noRouteTransition === "true"
      ) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      let nextUrl: URL;

      try {
        nextUrl = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      const currentRouteKey =
        currentRouteKeyRef.current ??
        (window.location.search
          ? `${window.location.pathname}${window.location.search}`
          : window.location.pathname);

      const nextRouteKey = nextUrl.search
        ? `${nextUrl.pathname}${nextUrl.search}`
        : nextUrl.pathname;

      if (nextRouteKey === currentRouteKey) {
        return;
      }

      startRouteTransition({ onlyIfInactive: true });
    };

    const handlePopState = () => {
      const currentRouteKey =
        currentRouteKeyRef.current ??
        (window.location.search
          ? `${window.location.pathname}${window.location.search}`
          : window.location.pathname);
      const nextRouteKey = window.location.search
        ? `${window.location.pathname}${window.location.search}`
        : window.location.pathname;

      if (nextRouteKey === currentRouteKey) {
        return;
      }

      startRouteTransition({ onlyIfInactive: true });
    };

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isPasskeyBridge, startRouteTransition]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const contextValue = useMemo<RouteTransitionContextValue>(
    () => ({
      isRouteTransitionActive: overlayState.mounted,
      startRouteTransition,
      finishRouteTransition,
    }),
    [finishRouteTransition, overlayState.mounted, startRouteTransition],
  );

  return (
    <RouteTransitionContext.Provider value={contextValue}>
      <Suspense fallback={null}>
        <RouteTransitionRouteTracker onRouteKeyChange={handleRouteKeyChange} />
      </Suspense>
      {children}
      {overlayState.mounted && !isPasskeyBridge ? (
        <PageLoadingOverlay
          isLoading={overlayState.active}
          messageContext={overlayState.messageContext}
          enableCycling={true}
          fadeDurationMs={ROUTE_OVERLAY_FADE_MS}
          priority
        />
      ) : null}
    </RouteTransitionContext.Provider>
  );
}

export function useRouteTransition() {
  const context = use(RouteTransitionContext);

  if (!context) {
    throw new Error(
      "useRouteTransition must be used within a RouteTransitionProvider",
    );
  }

  return context;
}
