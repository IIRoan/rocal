"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useRouteTransition,
  type RouteTransitionOptions,
} from "@/components/route-transition-provider";

type AppRouterInstance = ReturnType<typeof useRouter>;
type NavigateOptions = Parameters<AppRouterInstance["push"]>[1];

export function useSmoothRouter() {
  const router = useRouter();
  const {
    startRouteTransition,
    finishRouteTransition,
    isRouteTransitionActive,
  } = useRouteTransition();

  const push = useCallback(
    (
      href: string,
      options?: NavigateOptions,
      transitionOptions?: RouteTransitionOptions,
    ) => {
      if (typeof href !== "string" || href.length === 0) {
        return;
      }
      startRouteTransition(transitionOptions);
      router.push(href, options);
    },
    [router, startRouteTransition],
  );

  const replace = useCallback(
    (
      href: string,
      options?: NavigateOptions,
      transitionOptions?: RouteTransitionOptions,
    ) => {
      if (typeof href !== "string" || href.length === 0) {
        return;
      }
      startRouteTransition(transitionOptions);
      router.replace(href, options);
    },
    [router, startRouteTransition],
  );

  const prefetch = useCallback(
    (
      href: string,
      options?: Parameters<AppRouterInstance["prefetch"]>[1],
    ) => {
      if (typeof href !== "string" || href.length === 0) {
        return;
      }
      router.prefetch(href, options);
    },
    [router],
  );

  return useMemo(
    () => ({
      back: router.back,
      forward: router.forward,
      prefetch,
      refresh: router.refresh,
      push,
      replace,
      startRouteTransition,
      finishRouteTransition,
      isRouteTransitionActive,
    }),
    [
      finishRouteTransition,
      isRouteTransitionActive,
      push,
      replace,
      router.back,
      router.forward,
      prefetch,
      router.refresh,
      startRouteTransition,
    ],
  );
}
