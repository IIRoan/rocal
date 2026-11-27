"use client";

import { useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { MOTION_EASING, moveFrom, moveTo, playAfterPaint, slideFadeIn } from "@workspace/ui/lib/motion";
import { cn } from "@workspace/ui/lib/utils";
import { MAIL_READER_DRAWER_MS } from "./mail-reader-transition";

type DrawerState = { shownKey: string | null; entering: boolean };
const NOTHING_SHOWN: DrawerState = { shownKey: null, entering: false };

/** The conversations on screen as `openKey` changes: the next stays hidden until `ready`; it slides in over the empty reader but replaces another conversation at once, and a closed one slides off. */
export function useMailReaderDrawer(openKey: string | null, ready: boolean) {
  const [{ shownKey, entering }, setState] = useState<DrawerState>(NOTHING_SHOWN);

  if (openKey !== null && openKey !== shownKey && ready) {
    setState({ shownKey: openKey, entering: shownKey === null });
  }

  const pendingKey = openKey !== null && openKey !== shownKey ? openKey : null;
  const layers = [
    ...(shownKey === null
      ? []
      : [{ key: shownKey, revealed: true, slideIn: entering, leaving: openKey === null }]),
    ...(pendingKey === null
      ? []
      : [{ key: pendingKey, revealed: false, slideIn: false, leaving: false }]),
  ];
  return {
    layers,
    showEmpty: openKey === null || shownKey === null || entering,
    pending: pendingKey !== null,
    finishEnter: (key: string) =>
      setState((current) => (current.shownKey === key ? { shownKey: key, entering: false } : current)),
    finishLeave: () => setState(NOTHING_SHOWN),
  };
}

/** One conversation's surface: hidden until revealed, sliding in when `slideIn`; without children it keeps its last frame, inert. */
export function MailReaderLayer({
  revealed,
  slideIn,
  leaving,
  onEntered,
  onLeft,
  children,
}: {
  revealed: boolean;
  slideIn: boolean;
  leaving: boolean;
  onEntered: () => void;
  onLeft: () => void;
  children?: ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  // The pane stops rendering a conversation once another opens, so its last frame stays until the next has loaded.
  const [heldChildren, setHeldChildren] = useState(children);
  if (children !== undefined && children !== heldChildren) setHeldChildren(children);
  const shouldSlideIn = useEffectEvent(() => slideIn);
  const entered = useEffectEvent(() => onEntered());
  const left = useEffectEvent(() => onLeft());

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || !revealed || !shouldSlideIn()) return;
    const enter = moveFrom(layer, { x: layer.offsetWidth }, {
      duration: MAIL_READER_DRAWER_MS,
      easing: MOTION_EASING.reveal,
    });
    const finish = () => entered();
    if (!enter) {
      finish();
      return;
    }
    enter.addEventListener("finish", finish);
    return () => {
      enter.removeEventListener("finish", finish);
      enter.cancel();
    };
  }, [revealed]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || !leaving) return;
    const exit = moveTo(layer, { x: layer.offsetWidth }, {
      duration: MAIL_READER_DRAWER_MS,
      easing: MOTION_EASING.reveal,
    });
    const finish = () => left();
    if (!exit) {
      finish();
      return;
    }
    // Closing renders the empty reader underneath, so the slide waits for that paint instead of dropping its first frames.
    playAfterPaint(exit);
    exit.addEventListener("finish", finish);
    return () => {
      exit.removeEventListener("finish", finish);
      exit.cancel();
    };
  }, [leaving]);

  return (
    <div
      ref={layerRef}
      data-mail-reader-content=""
      inert={!revealed || leaving || children === undefined}
      className={cn("absolute inset-0 flex flex-col bg-[var(--bg-l2-solid)]", !revealed && "invisible")}
    >
      {children ?? heldChildren}
    </div>
  );
}

/** A small note above whatever the reader shows, only when a conversation takes a moment, so quick loads never flash it. */
export function MailReaderPending() {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const enter = slideFadeIn(root, null, { duration: 200, delay: 350, easing: MOTION_EASING.soft });
    return () => enter?.cancel();
  }, []);
  return (
    <div
      ref={rootRef}
      role="status"
      className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border-secondary)] bg-[var(--bg-l3-solid)] py-1 pr-3 pl-2 text-xs text-[var(--text-secondary)]"
    >
      <Loader2 aria-hidden className="size-3.5 animate-spin text-[var(--icon-tertiary)]" />
      Loading conversation
    </div>
  );
}
