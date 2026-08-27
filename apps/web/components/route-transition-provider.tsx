"use client";

import {
  Suspense,
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
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

type OverlayTimerRefs = {
  hideTimerRef: { current: number | null };
  unmountTimerRef: { current: number | null };
  firstFrameRef: { current: number | null };
  secondFrameRef: { current: number | null };
};

const DEFAULT_MESSAGE_CONTEXT: RouteLoadingMessageContext = "PAGE_LOAD";
const DEFAULT_MINIMUM_VISIBLE_MS = 140;
const ROUTE_OVERLAY_FADE_MS = 180;
const OVERLAY_EXIT_MS = ROUTE_OVERLAY_FADE_MS;
const PASSKEY_BRIDGE_ROUTE = "/passkey/native";

const RouteTransitionContext = createContext<
  RouteTransitionContextValue | undefined
>(undefined);

function isPasskeyBridgeRoute(routeKey: string | null) {
  return (
    routeKey === PASSKEY_BRIDGE_ROUTE ||
    routeKey?.startsWith(`${PASSKEY_BRIDGE_ROUTE}?`)
  );
}

function windowRouteKey(): string {
  return window.location.search
    ? `${window.location.pathname}${window.location.search}`
    : window.location.pathname;
}

function clearOverlayTimers(refs: OverlayTimerRefs) {
  if (refs.hideTimerRef.current !== null) {
    window.clearTimeout(refs.hideTimerRef.current);
    refs.hideTimerRef.current = null;
  }
  if (refs.unmountTimerRef.current !== null) {
    window.clearTimeout(refs.unmountTimerRef.current);
    refs.unmountTimerRef.current = null;
  }
  if (refs.firstFrameRef.current !== null) {
    window.cancelAnimationFrame(refs.firstFrameRef.current);
    refs.firstFrameRef.current = null;
  }
  if (refs.secondFrameRef.current !== null) {
    window.cancelAnimationFrame(refs.secondFrameRef.current);
    refs.secondFrameRef.current = null;
  }
}

function RouteTransitionRouteTracker({
  overlayState,
}: {
  overlayState: OverlayState;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const path = pathname ?? "";
  const search = searchParams.toString();
  const routeKey = search ? `${path}?${search}` : path;
  const isPasskeyBridge = isPasskeyBridgeRoute(routeKey);
  const { startRouteTransition, finishRouteTransition } = useRouteTransition();
  const startRouteTransitionEvent = useEffectEvent(startRouteTransition);
  const finishRouteTransitionEvent = useEffectEvent(finishRouteTransition);
  const currentRouteKeyRef = useRef<string | null>(null);
  const previousRouteKeyRef = useRef<string | null>(null);
  const didHydrateRef = useRef(false);
  const firstFrameRef = useRef<number | null>(null);
  const secondFrameRef = useRef<number | null>(null);

  useEffect(() => {
    currentRouteKeyRef.current = routeKey;
  }, [routeKey]);

  useEffect(() => {
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
        finishRouteTransitionEvent();
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
  }, [overlayState.mounted, routeKey]);

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

      const currentRouteKey = currentRouteKeyRef.current ?? windowRouteKey();
      const nextRouteKey = nextUrl.search
        ? `${nextUrl.pathname}${nextUrl.search}`
        : nextUrl.pathname;

      if (nextRouteKey === currentRouteKey) {
        return;
      }

      startRouteTransitionEvent({ onlyIfInactive: true });
    };

    const handlePopState = () => {
      const currentRouteKey = currentRouteKeyRef.current ?? windowRouteKey();
      const nextRouteKey = windowRouteKey();

      if (nextRouteKey === currentRouteKey) {
        return;
      }

      startRouteTransitionEvent({ onlyIfInactive: true });
    };

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isPasskeyBridge]);

  if (!overlayState.mounted || isPasskeyBridge) {
    return null;
  }

  return (
    <PageLoadingOverlay
      isLoading={overlayState.active}
      messageContext={overlayState.messageContext}
      enableCycling={true}
      fadeDurationMs={ROUTE_OVERLAY_FADE_MS}
      priority
    />
  );
}

export function RouteTransitionProvider({ children }: { children: ReactNode }) {
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

  function startRouteTransition(options: RouteTransitionOptions = {}) {
    clearOverlayTimers({
      hideTimerRef,
      unmountTimerRef,
      firstFrameRef,
      secondFrameRef,
    });
    const startedAt = Date.now();

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
        startedAt,
        minimumVisibleMs:
          options.minimumVisibleMs ?? DEFAULT_MINIMUM_VISIBLE_MS,
      };
    });
  }

  function finishRouteTransition() {
    clearOverlayTimers({
      hideTimerRef,
      unmountTimerRef,
      firstFrameRef,
      secondFrameRef,
    });

    if (!overlayState.mounted) {
      return;
    }

    const remainingMs = Math.max(
      overlayState.minimumVisibleMs - (Date.now() - overlayState.startedAt),
      0,
    );

    if (remainingMs > 0) {
      hideTimerRef.current = window.setTimeout(() => {
        setOverlayState((current) =>
          current.active ? { ...current, active: false } : current,
        );
      }, remainingMs);
      return;
    }

    setOverlayState((current) =>
      current.active ? { ...current, active: false } : current,
    );
  }

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
    return () => {
      clearOverlayTimers({
        hideTimerRef,
        unmountTimerRef,
        firstFrameRef,
        secondFrameRef,
      });
    };
  }, [firstFrameRef, hideTimerRef, secondFrameRef, unmountTimerRef]);

  const contextValue: RouteTransitionContextValue = {
    isRouteTransitionActive: overlayState.mounted,
    startRouteTransition,
    finishRouteTransition,
  };

  return (
    <RouteTransitionContext.Provider value={contextValue}>
      <Suspense fallback={null}>
        <RouteTransitionRouteTracker overlayState={overlayState} />
      </Suspense>
      {children}
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
