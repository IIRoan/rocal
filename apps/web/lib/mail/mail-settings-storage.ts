import {
  normalizeMailDisplaySettings,
  normalizeMailSignatures,
  normalizeMailTemplates,
  type MailSignature,
  type MailTemplate,
} from "@workspace/calendar-core";
import {
  decryptJsonPayload,
  encryptJsonPayload,
  parseEncryptedJsonPayload,
} from "../e2ee-crypto";
import { getActiveE2eeSession, type ActiveE2eeSession } from "../e2ee-session";

export const MAIL_DISPLAY_SETTINGS_STORAGE_KEY = "mail:displaySettings";
export const MAIL_TRUSTED_SENDERS_STORAGE_KEY = "mail:trustedSenders:sealed";
export const MAIL_TEMPLATES_STORAGE_KEY = "mail:templates:sealed";
export const MAIL_SIGNATURES_STORAGE_KEY = "mail:signatures:sealed";
export const MAIL_COMPOSE_SETTINGS_STORAGE_KEY = "mail:composeSettings";
export const MAIL_LIST_SETTINGS_STORAGE_KEY = "mail:listSettings";
export const MAIL_SETTINGS_SYNC_PENDING_KEY = "mail:settingsSyncPending";

const LEGACY_MAIL_DISPLAY_KEYS = [
  "mail:blockRemoteImages",
  "mail:blockTrackingPixels",
  "mail:darkMode",
];

type SealedListConfig<T> = {
  storageKey: string;
  aadPrefix: string;
  normalize: (value: unknown) => T[];
  /** Combines edits made before the sealed copy was opened with that copy. */
  mergeUnopened: (stored: T[], edits: T[]) => T[];
  changeEvent: string;
};

/** A private mail preference kept in memory and in web storage only as ciphertext under the account key. */
function createSealedLocalList<T>(config: SealedListConfig<T>) {
  let state: {
    session: ActiveE2eeSession | null;
    values: T[];
    edited: boolean;
    loaded: boolean;
  } | null = null;
  let generation = 0;
  let pendingWrite: Promise<void> = Promise.resolve();

  const aad = (session: ActiveE2eeSession) =>
    `${config.aadPrefix}:${session.userId}`;

  /** A list this account cannot open is corrupt or another account's leftover; drop it, the synced server copy is authoritative. */
  async function openStored(session: ActiveE2eeSession): Promise<T[]> {
    const stored = localStorage.getItem(config.storageKey);
    const encrypted = stored ? parseEncryptedJsonPayload(stored) : null;
    if (encrypted) {
      const opened = await decryptJsonPayload<unknown>(
        session.accountKey,
        encrypted,
        aad(session),
      )
        .then(config.normalize)
        .catch(() => null);
      if (opened) return opened;
    }
    if (stored && localStorage.getItem(config.storageKey) === stored) {
      localStorage.removeItem(config.storageKey);
    }
    return [];
  }

  /** Merge edits with the sealed copy while hydration is pending. */
  async function seal(
    session: ActiveE2eeSession,
    snapshot: T[],
    writeGeneration: number,
    loaded: boolean,
  ) {
    const values = loaded
      ? snapshot
      : config.mergeUnopened(await openStored(session), snapshot);
    const encrypted = await encryptJsonPayload(
      session.accountKey,
      values,
      aad(session),
    );
    if (
      writeGeneration === generation &&
      session === getActiveE2eeSession()
    ) {
      state = { session, values, edited: true, loaded: true };
      window.dispatchEvent(new CustomEvent(config.changeEvent));
    }
    return encrypted;
  }

  function read(): T[] {
    return state?.session === getActiveE2eeSession() ? [...state.values] : [];
  }

  function write(values: T[]): void {
    const session = getActiveE2eeSession();
    const snapshot = [...values];
    const loaded = state?.session === session && state.loaded;
    state = { session, values: snapshot, edited: true, loaded: Boolean(loaded) };
    const writeGeneration = ++generation;
    if (!session) return;
    pendingWrite = seal(session, snapshot, writeGeneration, Boolean(loaded))
      .then((encrypted) => {
        if (
          writeGeneration === generation &&
          session === getActiveE2eeSession()
        ) {
          localStorage.setItem(config.storageKey, JSON.stringify(encrypted));
          if (state) state.edited = false;
        }
      })
      .catch(() => undefined);
  }

  /** Restore the sealed copy before sync to preserve unsaved edits. */
  async function restore(): Promise<void> {
    const session = getActiveE2eeSession();
    if (!session || typeof window === "undefined") return;
    if (state?.edited && (!state.session || state.session === session)) {
      if (!state.session) write(state.values);
      await pendingWrite;
      if (state?.session === session && !state.loaded) {
        throw new Error("Saved mail settings could not be unlocked.");
      }
      return;
    }
    const restoreGeneration = generation;
    const values = await openStored(session);
    if (
      restoreGeneration !== generation ||
      session !== getActiveE2eeSession()
    )
      return;
    state = { session, values, edited: false, loaded: true };
    window.dispatchEvent(new CustomEvent(config.changeEvent));
  }

  function clearMemory(): void {
    generation += 1;
    state = null;
  }

  return { read, write, restore, clearMemory };
}

const trustedSenders = createSealedLocalList<string>({
  storageKey: MAIL_TRUSTED_SENDERS_STORAGE_KEY,
  aadPrefix: "mail-trusted-senders:v1",
  normalize: (value) =>
    normalizeMailDisplaySettings({ trustedSenders: value }).trustedSenders,
  mergeUnopened: (stored, edits) => [...new Set([...stored, ...edits])],
  changeEvent: "mail-display-settings-changed",
});

function mergeById<T extends { id: string }>(stored: T[], edits: T[]): T[] {
  return [...stored.filter((entry) => !edits.some((edit) => edit.id === entry.id)), ...edits];
}

const mailTemplates = createSealedLocalList<MailTemplate>({
  storageKey: MAIL_TEMPLATES_STORAGE_KEY,
  aadPrefix: "mail-templates:v1",
  normalize: normalizeMailTemplates,
  mergeUnopened: mergeById,
  changeEvent: "mail-compose-settings-changed",
});

const mailSignatures = createSealedLocalList<MailSignature>({
  storageKey: MAIL_SIGNATURES_STORAGE_KEY,
  aadPrefix: "mail-signatures:v1",
  normalize: normalizeMailSignatures,
  mergeUnopened: mergeById,
  changeEvent: "mail-compose-settings-changed",
});

export const readLocalTrustedSenders = trustedSenders.read;
export const writeLocalTrustedSenders = trustedSenders.write;
export const restoreLocalTrustedSenders = trustedSenders.restore;
export const clearLocalTrustedSendersMemory = trustedSenders.clearMemory;

export const readLocalMailTemplates = mailTemplates.read;
export const writeLocalMailTemplates = mailTemplates.write;
export const restoreLocalMailTemplates = mailTemplates.restore;
export const clearLocalMailTemplatesMemory = mailTemplates.clearMemory;

export const readLocalMailSignatures = mailSignatures.read;
export const writeLocalMailSignatures = mailSignatures.write;
export const restoreLocalMailSignatures = mailSignatures.restore;
export const clearLocalMailSignaturesMemory = mailSignatures.clearMemory;

/** Trusted senders, templates and signatures are private, and a leftover copy would be uploaded into the next account that signs in here. */
export function clearLocalMailSettings(): void {
  clearLocalTrustedSendersMemory();
  clearLocalMailTemplatesMemory();
  clearLocalMailSignaturesMemory();
  if (typeof window === "undefined") return;
  for (const key of [
    MAIL_DISPLAY_SETTINGS_STORAGE_KEY,
    MAIL_TRUSTED_SENDERS_STORAGE_KEY,
    MAIL_TEMPLATES_STORAGE_KEY,
    MAIL_SIGNATURES_STORAGE_KEY,
    MAIL_COMPOSE_SETTINGS_STORAGE_KEY,
    MAIL_LIST_SETTINGS_STORAGE_KEY,
    MAIL_SETTINGS_SYNC_PENDING_KEY,
    ...LEGACY_MAIL_DISPLAY_KEYS,
  ]) {
    localStorage.removeItem(key);
  }
}
