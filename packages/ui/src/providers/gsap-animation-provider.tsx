"use client";

import * as React from "react";
import { GSAP_EASES, getGsapDirectionOffset, gsap } from "../lib/gsap";
import { usePrefersReducedMotion } from "../hooks/use-prefers-reduced-motion";

const TARGET_SELECTOR = [
  "[class*='animate-']",
  "[class*='fade-in-']",
  "[class*='fade-out-']",
  "[class*='zoom-in-']",
  "[class*='zoom-out-']",
  "[class*='slide-in-from-']",
  "[class*='slide-out-to-']",
].join(",");

const SKIP_SELECTOR = [
  "[data-gsap-skip='true']",
  "[data-slot='skeleton']",
].join(",");

type LoopKind = "shimmer" | "wave";
type LoopRecord = Partial<Record<LoopKind, gsap.core.Tween>>;
const LAYOUT_TRANSFORM_CLASS_PATTERN = /(?:^|\s)-?translate-(?:x|y)-/;

function getClassNames(node: HTMLElement) {
  return node.getAttribute("class") ?? "";
}

export function shouldPreserveTransformAnimation(
  node: HTMLElement,
  classNames = getClassNames(node),
) {
  if (node.getAttribute("data-slot") === "dialog-content") {
    return true;
  }

  return LAYOUT_TRANSFORM_CLASS_PATTERN.test(classNames);
}

function parseDurationSeconds(classNames: string, fallback: number) {
  const arbitraryMatch = classNames.match(/duration-\[(\d+(?:\.\d+)?)ms\]/);

  if (arbitraryMatch) {
    return Number(arbitraryMatch[1]) / 1000;
  }

  const presetMatch = classNames.match(
    /\bduration-(75|100|150|180|200|250|300|500|700|1000)\b/,
  );

  if (presetMatch) {
    return Number(presetMatch[1]) / 1000;
  }

  return fallback;
}

function parseExplicitDirection(
  classNames: string,
  phase: "open" | "close",
  fallbackDistance: number,
) {
  const expression =
    phase === "open"
      ? /slide-in-from-(top|bottom|left|right)(?:-(\d+))?/
      : /slide-out-to-(top|bottom|left|right)(?:-(\d+))?/;
  const match = classNames.match(expression);

  if (!match) {
    return null;
  }

  const distance = match[2] ? Number(match[2]) * 4 : fallbackDistance;

  switch (match[1]) {
    case "top":
      return { x: 0, y: -distance };
    case "bottom":
      return { x: 0, y: distance };
    case "left":
      return { x: -distance, y: 0 };
    case "right":
      return { x: distance, y: 0 };
    default:
      return null;
  }
}

function getSurfaceDirection(
  node: HTMLElement,
  classNames: string,
  phase: "open" | "close",
) {
  const slot = node.getAttribute("data-slot");

  if (slot?.endsWith("overlay")) {
    return { x: 0, y: 0 };
  }

  const explicitDirection = parseExplicitDirection(classNames, phase, 12);

  if (explicitDirection) {
    return explicitDirection;
  }

  const statefulSide = node.getAttribute("data-side");

  if (statefulSide) {
    return phase === "open"
      ? getGsapDirectionOffset(statefulSide, 10)
      : getGsapDirectionOffset(statefulSide, 14);
  }

  const dialogVariant = node.getAttribute("data-variant");

  if (dialogVariant === "top") {
    return { x: 0, y: phase === "open" ? -24 : -16 };
  }

  if (dialogVariant === "center") {
    return { x: 0, y: 0 };
  }

  if (dialogVariant === "bottom") {
    return { x: 0, y: phase === "open" ? 24 : 16 };
  }

  if (dialogVariant === "spotlight") {
    return { x: 0, y: phase === "open" ? -18 : -12 };
  }

  const drawerDirection = node.getAttribute("data-vaul-drawer-direction");

  if (drawerDirection) {
    return phase === "open"
      ? getGsapDirectionOffset(drawerDirection, 18)
      : getGsapDirectionOffset(drawerDirection, 22);
  }

  if (classNames.includes("animate-slide-up")) {
    return { x: 0, y: phase === "open" ? 18 : 12 };
  }

  if (
    !classNames.includes("animate-slide-in") &&
    !classNames.includes("animate-slide-up") &&
    !classNames.includes("slide-in-from-") &&
    !classNames.includes("slide-out-to-") &&
    (classNames.includes("animate-fade-in") ||
      classNames.includes("fade-in-0") ||
      classNames.includes("fade-out-0"))
  ) {
    return { x: 0, y: 0 };
  }

  return { x: 0, y: phase === "open" ? 12 : 8 };
}

function getOpenScale(node: HTMLElement, classNames: string) {
  if (classNames.includes("animate-bounce-in")) {
    return 0.86;
  }

  if (
    classNames.includes("zoom-in-95") ||
    classNames.includes("animate-scale-in") ||
    classNames.includes("animate-fade-in-zoom") ||
    node.getAttribute("data-variant") === "center" ||
    node.getAttribute("data-variant") === "spotlight"
  ) {
    return 0.95;
  }

  return 1;
}

function getCloseScale(classNames: string) {
  if (classNames.includes("zoom-out-95")) {
    return 0.95;
  }

  return 1;
}

function hasRevealAnimation(classNames: string) {
  return [
    "animate-in",
    "animate-fade-in",
    "animate-slide-in",
    "animate-scale-in",
    "animate-bounce-in",
    "animate-slide-up",
    "animate-slide-fade",
    "animate-fade-in-zoom",
    "fade-in-0",
    "zoom-in-95",
    "slide-in-from-",
  ].some((token) => classNames.includes(token));
}

function hasStateDrivenAnimation(classNames: string) {
  return [
    "animate-in",
    "animate-out",
    "fade-in-0",
    "fade-out-0",
    "zoom-in-95",
    "zoom-out-95",
    "slide-in-from-",
    "slide-out-to-",
  ].some((token) => classNames.includes(token));
}

function scanTargets(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>(TARGET_SELECTOR));
}

function shouldSkipNode(node: HTMLElement) {
  return Boolean(
    node.closest(SKIP_SELECTOR) || node.querySelector(SKIP_SELECTOR),
  );
}

function clearAnimatedTransform(node: HTMLElement) {
  gsap.set(node, {
    clearProps: "x,y,scale,transform,translate,rotate",
  });
}

function hideSurface(node: HTMLElement, classNames: string) {
  const hiddenState = {
    autoAlpha: 0,
    pointerEvents: "none",
    visibility: "hidden",
  };

  if (shouldPreserveTransformAnimation(node, classNames)) {
    clearAnimatedTransform(node);
    gsap.set(node, hiddenState);
    return;
  }

  gsap.set(node, {
    ...hiddenState,
    x: 0,
    y: 0,
    scale: 1,
  });
}

function showSurface(node: HTMLElement, classNames: string) {
  if (shouldPreserveTransformAnimation(node, classNames)) {
    clearAnimatedTransform(node);
  }

  gsap.set(node, {
    pointerEvents: "auto",
    visibility: "visible",
  });
}

export function GsapAnimationProvider() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const loopTweensRef = React.useRef(new WeakMap<HTMLElement, LoopRecord>());
  const mountedRevealRef = React.useRef(new WeakSet<HTMLElement>());
  const previousStateRef = React.useRef(new WeakMap<HTMLElement, string>());

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const loopTweens = loopTweensRef.current;
    const mountedReveal = mountedRevealRef.current;
    const previousState = previousStateRef.current;

    const stopLoop = (node: HTMLElement, kind: LoopKind) => {
      const existing = loopTweens.get(node)?.[kind];

      if (!existing) {
        return;
      }

      existing.kill();

      const updatedLoops = { ...(loopTweens.get(node) ?? {}) };
      delete updatedLoops[kind];
      loopTweens.set(node, updatedLoops);

      if (kind === "wave") {
        gsap.set(node, { clearProps: "xPercent" });
      }

      if (kind === "shimmer") {
        gsap.set(node, { clearProps: "backgroundPositionX" });
      }
    };

    const ensureLoop = (
      node: HTMLElement,
      kind: LoopKind,
      factory: () => gsap.core.Tween,
    ) => {
      const current = loopTweens.get(node) ?? {};

      if (current[kind]) {
        return;
      }

      const tween = factory();
      loopTweens.set(node, { ...current, [kind]: tween });
    };

    const syncLoops = (node: HTMLElement) => {
      const classNames = getClassNames(node);

      if (prefersReducedMotion) {
        stopLoop(node, "wave");
        stopLoop(node, "shimmer");
        return;
      }

      // `animate-spin` and `animate-pulse` are intentionally driven by native
      // CSS keyframes (see globals.css). They must keep working without this
      // provider mounted, and a parallel GSAP transform tween would fight the
      // CSS animation by writing inline `transform`.

      if (classNames.includes("animate-wave")) {
        ensureLoop(node, "wave", () =>
          gsap.fromTo(
            node,
            { xPercent: -120 },
            {
              xPercent: 120,
              duration: 2.4,
              ease: GSAP_EASES.gentle,
              repeat: -1,
            },
          ),
        );
      } else {
        stopLoop(node, "wave");
      }

      if (classNames.includes("animate-shimmer")) {
        ensureLoop(node, "shimmer", () =>
          gsap.fromTo(
            node,
            { backgroundPositionX: "-200%" },
            {
              backgroundPositionX: "200%",
              duration: 1.5,
              ease: GSAP_EASES.gentle,
              repeat: -1,
            },
          ),
        );
      } else {
        stopLoop(node, "shimmer");
      }
    };

    const animateReveal = (node: HTMLElement) => {
      if (mountedReveal.has(node) || node.hasAttribute("data-state")) {
        return;
      }

      const classNames = getClassNames(node);
      const preserveTransform = shouldPreserveTransformAnimation(
        node,
        classNames,
      );

      if (!hasRevealAnimation(classNames)) {
        return;
      }

      mountedReveal.add(node);

      if (preserveTransform) {
        clearAnimatedTransform(node);
      }

      if (prefersReducedMotion) {
        gsap.set(node, { autoAlpha: 1 });
        return;
      }

      const offset = preserveTransform
        ? null
        : getSurfaceDirection(node, classNames, "open");
      const scale = preserveTransform ? 1 : getOpenScale(node, classNames);
      const fadeIn =
        classNames.includes("fade-in-0") ||
        classNames.includes("animate-fade-in") ||
        classNames.includes("animate-in");

      const fromVars: gsap.TweenVars = {
        autoAlpha:
          fadeIn ||
          Boolean(offset && (offset.x !== 0 || offset.y !== 0)) ||
          scale !== 1
            ? 0
            : 1,
      };

      const toVars: gsap.TweenVars = {
        autoAlpha: 1,
        duration: parseDurationSeconds(classNames, 0.24),
        ease: classNames.includes("animate-bounce-in")
          ? "back.out(1.55)"
          : GSAP_EASES.reveal,
        overwrite: "auto",
      };

      if (offset) {
        fromVars.x = offset.x;
        fromVars.y = offset.y;
        toVars.x = 0;
        toVars.y = 0;
      }

      if (!preserveTransform && scale !== 1) {
        fromVars.scale = scale;
        toVars.scale = 1;
      }

      gsap.fromTo(node, fromVars, toVars);
    };

    const syncSurfaceState = (node: HTMLElement) => {
      if (!node.hasAttribute("data-state")) {
        return;
      }

      const classNames = getClassNames(node);
      const preserveTransform = shouldPreserveTransformAnimation(
        node,
        classNames,
      );

      if (!hasStateDrivenAnimation(classNames)) {
        return;
      }

      const state = node.getAttribute("data-state") ?? "closed";
      const previous = previousState.get(node);

      previousState.set(node, state);

      if (state === previous) {
        return;
      }

      gsap.killTweensOf(node);

      if (preserveTransform) {
        clearAnimatedTransform(node);
      }

      if (state === "open") {
        showSurface(node, classNames);

        if (prefersReducedMotion) {
          gsap.set(node, { autoAlpha: 1 });
          return;
        }

        const offset = preserveTransform
          ? null
          : getSurfaceDirection(node, classNames, "open");
        const fromVars: gsap.TweenVars = { autoAlpha: 0 };
        const toVars: gsap.TweenVars = {
          autoAlpha: 1,
          duration: parseDurationSeconds(classNames, 0.2),
          ease: GSAP_EASES.reveal,
          overwrite: "auto",
        };

        if (offset) {
          fromVars.x = offset.x;
          fromVars.y = offset.y;
          toVars.x = 0;
          toVars.y = 0;
        }

        if (!preserveTransform) {
          fromVars.scale = getOpenScale(node, classNames);
          toVars.scale = 1;
        }

        gsap.fromTo(node, fromVars, toVars);

        return;
      }

      if (previous === undefined || prefersReducedMotion) {
        hideSurface(node, classNames);
        return;
      }

      const offset = preserveTransform
        ? null
        : getSurfaceDirection(node, classNames, "close");
      const toVars: gsap.TweenVars = {
        autoAlpha: 0,
        duration: parseDurationSeconds(classNames, 0.16),
        ease: GSAP_EASES.exit,
        overwrite: "auto",
        onStart: () => {
          gsap.set(node, { pointerEvents: "none" });
        },
        onComplete: () => {
          gsap.set(node, { visibility: "hidden" });
        },
      };

      if (offset) {
        toVars.x = offset.x;
        toVars.y = offset.y;
      }

      if (!preserveTransform) {
        toVars.scale = getCloseScale(classNames);
      }

      gsap.to(node, toVars);
    };

    const processNode = (node: HTMLElement) => {
      if (shouldSkipNode(node)) {
        cleanupNode(node);
        return;
      }

      syncLoops(node);
      syncSurfaceState(node);
      animateReveal(node);
    };

    const cleanupNode = (node: HTMLElement) => {
      stopLoop(node, "wave");
      stopLoop(node, "shimmer");
      gsap.killTweensOf(node);

      for (const child of scanTargets(node)) {
        stopLoop(child, "wave");
        stopLoop(child, "shimmer");
        gsap.killTweensOf(child);
      }
    };

    const processTree = (root: ParentNode) => {
      for (const node of scanTargets(root)) {
        processNode(node);
      }
    };

    processTree(document);

    // Batch DOM mutations into a single rAF flush. On a calendar app where
    // hundreds of cells can re-render per drag/scroll, processing every
    // attribute/child mutation synchronously would spam GSAP with redundant
    // work during a single React commit.
    const pendingNodes = new Set<HTMLElement>();
    const pendingRemovals = new Set<HTMLElement>();
    let flushHandle: number | null = null;

    const flush = () => {
      flushHandle = null;
      const removals = Array.from(pendingRemovals);
      const updates = Array.from(pendingNodes);
      pendingRemovals.clear();
      pendingNodes.clear();

      for (const node of removals) {
        cleanupNode(node);
      }

      for (const node of updates) {
        if (!node.isConnected) {
          cleanupNode(node);
          continue;
        }
        processNode(node);
      }
    };

    const scheduleFlush = () => {
      if (flushHandle !== null) {
        return;
      }
      flushHandle =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame(flush)
          : (window.setTimeout(flush, 0) as unknown as number);
    };

    const queueNode = (node: HTMLElement) => {
      pendingRemovals.delete(node);
      pendingNodes.add(node);
      scheduleFlush();
    };

    const queueRemoval = (node: HTMLElement) => {
      pendingNodes.delete(node);
      pendingRemovals.add(node);
      scheduleFlush();
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.type === "attributes" &&
          record.target instanceof HTMLElement
        ) {
          queueNode(record.target);
          continue;
        }

        if (record.type !== "childList") {
          continue;
        }

        for (const removed of record.removedNodes) {
          if (!(removed instanceof HTMLElement)) {
            continue;
          }

          queueRemoval(removed);
        }

        for (const added of record.addedNodes) {
          if (!(added instanceof HTMLElement)) {
            continue;
          }

          if (added.matches(TARGET_SELECTOR)) {
            queueNode(added);
          }

          for (const descendant of scanTargets(added)) {
            queueNode(descendant);
          }
        }
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "class",
        "data-gsap-skip",
        "data-side",
        "data-slot",
        "data-state",
        "data-vaul-drawer-direction",
        "data-variant",
      ],
    });

    return () => {
      observer.disconnect();
      if (flushHandle !== null) {
        if (typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(flushHandle);
        } else {
          window.clearTimeout(flushHandle);
        }
        flushHandle = null;
      }
      pendingNodes.clear();
      pendingRemovals.clear();
    };
  }, [prefersReducedMotion]);

  return null;
}
