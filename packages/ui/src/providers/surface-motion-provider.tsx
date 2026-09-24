"use client";

import * as React from "react";
import {
  MOTION_EASING,
  slideFadeIn,
  slideFadeOut,
  type MotionOffset,
} from "../lib/motion";
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
  "[data-motion-skip='true']",
  "[data-slot='skeleton']",
].join(",");

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

function parseDurationMs(classNames: string, fallback: number) {
  const arbitraryMatch = classNames.match(/duration-\[(\d+(?:\.\d+)?)ms\]/);

  if (arbitraryMatch) {
    return Number(arbitraryMatch[1]);
  }

  const presetMatch = classNames.match(
    /\bduration-(75|100|150|180|200|250|300|500|700|1000)\b/,
  );

  if (presetMatch) {
    return Number(presetMatch[1]);
  }

  return fallback;
}

function getSideOffset(side: string | null, distance: number): MotionOffset {
  switch (side) {
    case "top":
      return { x: 0, y: distance };
    case "bottom":
      return { x: 0, y: -distance };
    case "left":
      return { x: distance, y: 0 };
    case "right":
      return { x: -distance, y: 0 };
    default:
      return { x: 0, y: distance };
  }
}

function parseExplicitDirection(
  classNames: string,
  phase: "open" | "close",
  fallbackDistance: number,
): MotionOffset | null {
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
): MotionOffset {
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
    return getSideOffset(statefulSide, phase === "open" ? 10 : 14);
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
    return getSideOffset(drawerDirection, phase === "open" ? 18 : 22);
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
  return classNames.includes("zoom-out-95") ? 0.95 : 1;
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

/** Radix tooltips report `delayed-open` / `instant-open` instead of `open`. */
function toSurfacePhase(state: string | null): "open" | "closed" | null {
  if (state === "closed") return "closed";
  if (state === "open" || state?.endsWith("-open")) return "open";
  return null;
}

function scanTargets(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>(TARGET_SELECTOR));
}

function shouldSkipNode(node: HTMLElement) {
  return Boolean(
    node.closest(SKIP_SELECTOR) || node.querySelector(SKIP_SELECTOR),
  );
}

function withScale(offset: MotionOffset | null, scale: number) {
  if (scale === 1) return offset;
  return { ...(offset ?? {}), scale };
}

function isVisibleOffset(offset: MotionOffset | null) {
  return Boolean(
    offset && (offset.x || offset.y || (offset.scale ?? 1) !== 1),
  );
}

/** Animates Radix surfaces and `animate-*` reveals with WAAPI; closed surfaces are hidden by CSS in globals.css. */
export function SurfaceMotionProvider() {
  const prefersReducedMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const running = new WeakMap<HTMLElement, Animation>();
    const revealed = new WeakSet<HTMLElement>();
    const previousPhase = new WeakMap<HTMLElement, "open" | "closed">();

    const play = (node: HTMLElement, animation: Animation | null) => {
      running.get(node)?.cancel();
      if (animation) running.set(node, animation);
      else running.delete(node);
    };

    const animateReveal = (node: HTMLElement, classNames: string) => {
      if (
        revealed.has(node) ||
        node.hasAttribute("data-state") ||
        !hasRevealAnimation(classNames)
      ) {
        return;
      }

      revealed.add(node);
      if (prefersReducedMotion) return;

      const preserveTransform = shouldPreserveTransformAnimation(
        node,
        classNames,
      );
      const offset = preserveTransform
        ? null
        : withScale(
            getSurfaceDirection(node, classNames, "open"),
            getOpenScale(node, classNames),
          );
      const fadeIn =
        classNames.includes("fade-in-0") ||
        classNames.includes("animate-fade-in") ||
        classNames.includes("animate-in");

      if (!fadeIn && !isVisibleOffset(offset)) return;

      play(
        node,
        slideFadeIn(node, isVisibleOffset(offset) ? offset : null, {
          duration: parseDurationMs(classNames, 240),
          easing: classNames.includes("animate-bounce-in")
            ? MOTION_EASING.overshoot
            : MOTION_EASING.reveal,
        }),
      );
    };

    const syncSurfaceState = (node: HTMLElement, classNames: string) => {
      const phase = toSurfacePhase(node.getAttribute("data-state"));
      if (!phase || !hasStateDrivenAnimation(classNames)) return;

      const previous = previousPhase.get(node);
      previousPhase.set(node, phase);
      if (phase === previous) return;

      if (prefersReducedMotion || (phase === "closed" && !previous)) {
        play(node, null);
        return;
      }

      const preserveTransform = shouldPreserveTransformAnimation(
        node,
        classNames,
      );
      const direction = preserveTransform
        ? null
        : getSurfaceDirection(
            node,
            classNames,
            phase === "open" ? "open" : "close",
          );

      if (phase === "open") {
        const offset = preserveTransform
          ? null
          : withScale(direction, getOpenScale(node, classNames));
        play(
          node,
          slideFadeIn(node, isVisibleOffset(offset) ? offset : null, {
            duration: parseDurationMs(classNames, 200),
          }),
        );
        return;
      }

      const offset = preserveTransform
        ? null
        : withScale(direction, getCloseScale(classNames));
      play(
        node,
        slideFadeOut(node, isVisibleOffset(offset) ? offset : null, {
          duration: parseDurationMs(classNames, 160),
        }),
      );
    };

    const processNode = (node: HTMLElement) => {
      if (shouldSkipNode(node)) {
        play(node, null);
        return;
      }

      const classNames = getClassNames(node);
      syncSurfaceState(node, classNames);
      animateReveal(node, classNames);
    };

    for (const node of scanTargets(document)) {
      processNode(node);
    }

    // Batch mutations into one rAF flush so a busy calendar commit doesn't process every attribute change synchronously.
    const pendingNodes = new Set<HTMLElement>();
    let flushHandle: number | null = null;

    const flush = () => {
      flushHandle = null;
      const updates = Array.from(pendingNodes);
      pendingNodes.clear();

      for (const node of updates) {
        if (node.isConnected) processNode(node);
      }
    };

    const queueNode = (node: HTMLElement) => {
      pendingNodes.add(node);
      if (flushHandle === null) {
        flushHandle = requestAnimationFrame(flush);
      }
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          if (
            record.target instanceof HTMLElement &&
            record.target.matches(TARGET_SELECTOR)
          ) {
            queueNode(record.target);
          }
          continue;
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
      attributeFilter: ["class", "data-state"],
    });

    return () => {
      observer.disconnect();
      if (flushHandle !== null) {
        cancelAnimationFrame(flushHandle);
      }
      pendingNodes.clear();
    };
  }, [prefersReducedMotion]);

  return null;
}
