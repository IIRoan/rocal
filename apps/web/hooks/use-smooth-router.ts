"use client";

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

  const push = (
    href: string,
    options?: NavigateOptions,
    transitionOptions?: RouteTransitionOptions,
  ) => {
    if (typeof href !== "string" || href.length === 0) {
      return;
    }
    startRouteTransition(transitionOptions);
    router.push(href, options);
  };

  const replace = (
    href: string,
    options?: NavigateOptions,
    transitionOptions?: RouteTransitionOptions,
  ) => {
    if (typeof href !== "string" || href.length === 0) {
      return;
    }
    startRouteTransition(transitionOptions);
    router.replace(href, options);
  };

  const prefetch = (
    href: string,
    options?: Parameters<AppRouterInstance["prefetch"]>[1],
  ) => {
    if (typeof href !== "string" || href.length === 0) {
      return;
    }
    router.prefetch(href, options);
  };

  return ({
    back: router.back,
    forward: router.forward,
    prefetch,
    refresh: router.refresh,
    push,
    replace,
    startRouteTransition,
    finishRouteTransition,
    isRouteTransitionActive,
  });
}
