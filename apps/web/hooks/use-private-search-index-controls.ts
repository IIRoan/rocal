"use client";

import { useCallback, useState } from "react";
import { clearLocalSearchIndexDatabase } from "@/lib/search/local-index-store";

const ENABLED_KEY = "search:private-content-index-enabled";
const PAUSED_KEY = "search:private-content-index-paused";
const CONSENT_KEY = "search:private-content-index-consent";
export const PRIVATE_SEARCH_INDEX_CHANGE_EVENT =
  "solace-private-search-index-changed";

export type PrivateSearchIndexConsent = "undecided" | "accepted" | "declined";

function notifyPrivateSearchIndexChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PRIVATE_SEARCH_INDEX_CHANGE_EVENT));
}

function readBoolean(key: string, fallback = false): boolean {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) === "true";
}

function readConsent(): PrivateSearchIndexConsent {
  if (typeof window === "undefined") return "undecided";
  const stored = window.localStorage.getItem(CONSENT_KEY);
  return stored === "accepted" || stored === "declined"
    ? stored
    : "undecided";
}

export function usePrivateSearchIndexControls() {
  const [enabled, setEnabledState] = useState(() => readBoolean(ENABLED_KEY));
  const [paused, setPausedState] = useState(() => readBoolean(PAUSED_KEY));
  const [consent, setConsentState] = useState<PrivateSearchIndexConsent>(() =>
    readConsent(),
  );
  const [isClearing, setIsClearing] = useState(false);

  const setConsent = useCallback((value: PrivateSearchIndexConsent) => {
    setConsentState(value);
    window.localStorage.setItem(CONSENT_KEY, value);
    notifyPrivateSearchIndexChanged();
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    window.localStorage.setItem(ENABLED_KEY, String(value));
    setConsent(value ? "accepted" : "declined");
    if (!value) {
      setPausedState(false);
      window.localStorage.setItem(PAUSED_KEY, "false");
    }
  }, [setConsent]);

  const setPaused = useCallback((value: boolean) => {
    setPausedState(value);
    window.localStorage.setItem(PAUSED_KEY, String(value));
    notifyPrivateSearchIndexChanged();
  }, []);

  const clearIndex = useCallback(async () => {
    setIsClearing(true);
    try {
      await clearLocalSearchIndexDatabase();
      setEnabled(false);
    } finally {
      setIsClearing(false);
    }
  }, [setEnabled]);

  return {
    enabled,
    paused,
    consent,
    hasMadeChoice: consent !== "undecided",
    isClearing,
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    accept: () => setEnabled(true),
    decline: () => {
      setEnabledState(false);
      setPausedState(false);
      window.localStorage.setItem(ENABLED_KEY, "false");
      window.localStorage.setItem(PAUSED_KEY, "false");
      setConsent("declined");
    },
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    clearIndex,
  };
}
