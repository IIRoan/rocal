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
      startRouteTransition(transitionOptions);
      router.replace(href, options);
    },
    [router, startRouteTransition],
  );

  return useMemo(
    () => ({
      back: router.back,
      forward: router.forward,
      prefetch: router.prefetch,
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
      router.prefetch,
      router.refresh,
      startRouteTransition,
    ],
  );
}
