"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  buildMailUrl,
  locationsEqual,
  normalizeMailLocation,
  parseMailLocation,
  resolveMailboxFromSegment,
  shouldClearMessageSelection,
} from "@/lib/mail/mail-url";
import type { JmapMailbox } from "@/lib/mail/types";

const MAIL_URL_CHANGED_EVENT = "mail:url-changed";

type UseMailUrlSyncInput = {
  activeMailbox: {
    mailboxes: JmapMailbox[];
    selectedMailboxId: string | null;
    messages: { id: string; messageId?: string[] }[];
  } | null;
  selectedMessageId: string | null;
  onSelectMailbox: (mailboxId: string) => void | Promise<void>;
  onSelectMessageId: (messageId: string | null) => void;
  openMessageById: (messageId: string) => void | Promise<void>;
};

function getBrowserLocation(): string {
  if (typeof window === "undefined") {
    return "/mail";
  }

  return `${window.location.pathname}${window.location.search}`;
}

function subscribeBrowserLocation(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(MAIL_URL_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(MAIL_URL_CHANGED_EVENT, onStoreChange);
  };
}

function replaceMailBrowserUrl(nextLocation: string): void {
  const currentLocation = getBrowserLocation();
  if (locationsEqual(currentLocation, nextLocation)) return;

  window.history.replaceState(null, "", nextLocation);
  window.dispatchEvent(new Event(MAIL_URL_CHANGED_EVENT));
}

export function useMailUrlSync({
  activeMailbox,
  selectedMessageId,
  onSelectMailbox,
  onSelectMessageId,
  openMessageById,
}: UseMailUrlSyncInput) {
  const pathname = usePathname() ?? "/mail";
  const browserLocation = useSyncExternalStore(
    subscribeBrowserLocation,
    getBrowserLocation,
    () => "/mail",
  );
  const initializedRef = useRef(false);
  const isApplyingRouteRef = useRef(false);
  const isUpdatingUrlRef = useRef(false);
  const lastAppliedRouteKeyRef = useRef<string | null>(null);

  const applyRouteFromUrl = useCallback(async () => {
    if (!activeMailbox || typeof window === "undefined") return;
    if (isUpdatingUrlRef.current) return;
    if (lastAppliedRouteKeyRef.current === browserLocation) return;

    const search = window.location.search.replace(/^\?/, "");
    const normalizedLocation = normalizeMailLocation(pathname, search);
    const route = parseMailLocation(pathname, search);

    isApplyingRouteRef.current = true;
    lastAppliedRouteKeyRef.current = browserLocation;
    try {
      if (!locationsEqual(browserLocation, normalizedLocation)) {
        replaceMailBrowserUrl(normalizedLocation);
        lastAppliedRouteKeyRef.current = normalizedLocation;
      }

      if (route.mailboxSegment) {
        const mailbox = resolveMailboxFromSegment(
          route.mailboxSegment,
          activeMailbox.mailboxes,
        );
        if (mailbox && mailbox.id !== activeMailbox.selectedMailboxId) {
          await onSelectMailbox(mailbox.id);
        }
      }

      if (route.messageId) {
        if (route.messageId !== selectedMessageId) {
          await openMessageById(route.messageId);
        }
      } else if (shouldClearMessageSelection(route, selectedMessageId)) {
        onSelectMessageId(null);
      }
    } finally {
      queueMicrotask(() => {
        isApplyingRouteRef.current = false;
      });
    }
  }, [
    activeMailbox,
    browserLocation,
    onSelectMailbox,
    onSelectMessageId,
    openMessageById,
    pathname,
    selectedMessageId,
  ]);

  useEffect(() => {
    if (!activeMailbox) return;

    if (!initializedRef.current) {
      initializedRef.current = true;
    }

    void applyRouteFromUrl();
  }, [activeMailbox, applyRouteFromUrl, browserLocation]);

  useEffect(() => {
    if (!initializedRef.current || !activeMailbox) return;
    if (isApplyingRouteRef.current || isUpdatingUrlRef.current) return;

    const selectedMailbox =
      activeMailbox.mailboxes.find(
        (mailbox) => mailbox.id === activeMailbox.selectedMailboxId,
      ) ?? null;
    const selectedMessage =
      selectedMessageId != null
        ? activeMailbox.messages.find(
            (message) => message.id === selectedMessageId,
          )
        : undefined;

    const nextLocation = buildMailUrl({
      mailbox: selectedMailbox,
      messageId: selectedMessageId,
      messageHeaderIds: selectedMessage?.messageId,
    });

    if (locationsEqual(browserLocation, nextLocation)) return;

    isUpdatingUrlRef.current = true;
    replaceMailBrowserUrl(nextLocation);
    lastAppliedRouteKeyRef.current = nextLocation;
    queueMicrotask(() => {
      isUpdatingUrlRef.current = false;
    });
  }, [activeMailbox, browserLocation, selectedMessageId]);
}
