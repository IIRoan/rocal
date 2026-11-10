import { normalizeMailDisplaySettings } from "@workspace/calendar-core";
import {
  decryptJsonPayload,
  encryptJsonPayload,
  parseEncryptedJsonPayload,
} from "../e2ee-crypto";
import { getActiveE2eeSession, type ActiveE2eeSession } from "../e2ee-session";

export const MAIL_DISPLAY_SETTINGS_STORAGE_KEY = "mail:displaySettings";
export const MAIL_TRUSTED_SENDERS_STORAGE_KEY = "mail:trustedSenders:sealed";
export const MAIL_COMPOSE_SETTINGS_STORAGE_KEY = "mail:composeSettings";
export const MAIL_LIST_SETTINGS_STORAGE_KEY = "mail:listSettings";
export const MAIL_SETTINGS_SYNC_PENDING_KEY = "mail:settingsSyncPending";

const LEGACY_MAIL_DISPLAY_KEYS = [
  "mail:blockRemoteImages",
  "mail:blockTrackingPixels",
  "mail:darkMode",
];

let trustedSenders: {
  session: ActiveE2eeSession | null;
  values: string[];
  edited: boolean;
  loaded: boolean;
} | null = null;
let trustedSendersGeneration = 0;
let pendingTrustedSendersWrite: Promise<void> = Promise.resolve();

export function readLocalTrustedSenders(): string[] {
  return trustedSenders?.session === getActiveE2eeSession()
    ? [...trustedSenders.values]
    : [];
}

export function writeLocalTrustedSenders(values: string[]): void {
  const session = getActiveE2eeSession();
  const snapshot = [...values];
  const loaded = trustedSenders?.session === session && trustedSenders.loaded;
  trustedSenders = {
    session,
    values: snapshot,
    edited: true,
    loaded: Boolean(loaded),
  };
  const generation = ++trustedSendersGeneration;
  if (!session) return;
  pendingTrustedSendersWrite = sealTrustedSenders(
    session,
    snapshot,
    generation,
    Boolean(loaded),
  )
    .then((encrypted) => {
      if (
        generation === trustedSendersGeneration &&
        session === getActiveE2eeSession()
      ) {
        localStorage.setItem(
          MAIL_TRUSTED_SENDERS_STORAGE_KEY,
          JSON.stringify(encrypted),
        );
        if (trustedSenders) trustedSenders.edited = false;
      }
    })
    .catch(() => undefined);
}

function trustedSendersAad(session: ActiveE2eeSession): string {
  return `mail-trusted-senders:v1:${session.userId}`;
}

/** A list this account cannot open is corrupt or another account's leftover; drop it, the synced server copy is authoritative. */
async function openStoredTrustedSenders(
  session: ActiveE2eeSession,
): Promise<string[]> {
  const stored = localStorage.getItem(MAIL_TRUSTED_SENDERS_STORAGE_KEY);
  const encrypted = stored ? parseEncryptedJsonPayload(stored) : null;
  if (encrypted) {
    const opened = await decryptJsonPayload<unknown>(
      session.accountKey,
      encrypted,
      trustedSendersAad(session),
    )
      .then(
        (value) =>
          normalizeMailDisplaySettings({ trustedSenders: value }).trustedSenders,
      )
      .catch(() => null);
    if (opened) return opened;
  }
  if (stored && localStorage.getItem(MAIL_TRUSTED_SENDERS_STORAGE_KEY) === stored) {
    localStorage.removeItem(MAIL_TRUSTED_SENDERS_STORAGE_KEY);
  }
  return [];
}

/** Merge edits with sealed senders while hydration is pending. */
async function sealTrustedSenders(
  session: ActiveE2eeSession,
  snapshot: string[],
  generation: number,
  loaded: boolean,
) {
  const values = loaded
    ? snapshot
    : [...new Set([...(await openStoredTrustedSenders(session)), ...snapshot])];
  const encrypted = await encryptJsonPayload(
    session.accountKey,
    values,
    trustedSendersAad(session),
  );
  if (
    generation === trustedSendersGeneration &&
    session === getActiveE2eeSession()
  ) {
    trustedSenders = { session, values, edited: true, loaded: true };
    window.dispatchEvent(new CustomEvent("mail-display-settings-changed"));
  }
  return encrypted;
}

/** Restore sealed senders before sync to preserve unsaved edits. */
export async function restoreLocalTrustedSenders(): Promise<void> {
  const session = getActiveE2eeSession();
  if (!session || typeof window === "undefined") return;
  if (
    trustedSenders?.edited &&
    (!trustedSenders.session || trustedSenders.session === session)
  ) {
    if (!trustedSenders.session)
      writeLocalTrustedSenders(trustedSenders.values);
    await pendingTrustedSendersWrite;
    if (trustedSenders?.session === session && !trustedSenders.loaded) {
      throw new Error("Saved mail settings could not be unlocked.");
    }
    return;
  }
  const generation = trustedSendersGeneration;
  const values = await openStoredTrustedSenders(session);
  if (
    generation !== trustedSendersGeneration ||
    session !== getActiveE2eeSession()
  )
    return;
  trustedSenders = { session, values, edited: false, loaded: true };
  window.dispatchEvent(new CustomEvent("mail-display-settings-changed"));
}

export function clearLocalTrustedSendersMemory(): void {
  trustedSendersGeneration += 1;
  trustedSenders = null;
}

/** Trusted senders are PII, and a leftover copy would be uploaded into the next account that signs in here. */
export function clearLocalMailSettings(): void {
  clearLocalTrustedSendersMemory();
  if (typeof window === "undefined") return;
  for (const key of [
    MAIL_DISPLAY_SETTINGS_STORAGE_KEY,
    MAIL_TRUSTED_SENDERS_STORAGE_KEY,
    MAIL_COMPOSE_SETTINGS_STORAGE_KEY,
    MAIL_LIST_SETTINGS_STORAGE_KEY,
    MAIL_SETTINGS_SYNC_PENDING_KEY,
    ...LEGACY_MAIL_DISPLAY_KEYS,
  ]) {
    localStorage.removeItem(key);
  }
}
