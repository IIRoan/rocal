/** Custom folder names are sealed to the account key on the device, so the mail server stores only ciphertext. */
export const SEALED_MAILBOX_NAME_PREFIX = "enc1.";
export const UNREADABLE_MAILBOX_NAME = "Encrypted folder";

const MAILBOX_NAME_AAD = "mail-mailbox-name:v1";
const SEALED_IV_LENGTH = 16;
const GCM_TAG_BYTES = 16;
const textEncoder = new TextEncoder();

type SealedNamePayload = {
  version: number;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
};

export interface MailboxNameCipher {
  seal(name: string): Promise<string>;
  open(name: string): Promise<string>;
}

export function isSealedMailboxName(name: string): boolean {
  return name.startsWith(SEALED_MAILBOX_NAME_PREFIX);
}

/** Role folders keep their names: the server finds them by role, and their names are not personal. */
export function isCustomMailbox(mailbox: { role?: string | null }): boolean {
  return !mailbox.role;
}

export function createMailboxNameCipher<Key>(
  e2ee: {
    encryptJsonPayload(key: Key, payload: unknown, aad?: string): Promise<SealedNamePayload>;
    decryptJsonPayload<T>(key: Key, payload: SealedNamePayload, aad?: string): Promise<T>;
  },
  accountKey: Key,
): MailboxNameCipher {
  return {
    seal: async (name) => {
      const { iv, ciphertext } = await e2ee.encryptJsonPayload(
        accountKey,
        name,
        MAILBOX_NAME_AAD,
      );
      return `${SEALED_MAILBOX_NAME_PREFIX}${iv}.${ciphertext}`;
    },
    open: async (name) => {
      if (!isSealedMailboxName(name)) return name;
      const [iv = "", ciphertext = ""] = name
        .slice(SEALED_MAILBOX_NAME_PREFIX.length)
        .split(".");
      const opened = await e2ee
        .decryptJsonPayload<unknown>(
          accountKey,
          { version: 1, algorithm: "AES-GCM", iv, ciphertext },
          MAILBOX_NAME_AAD,
        )
        .catch(() => null);
      return typeof opened === "string" ? opened : UNREADABLE_MAILBOX_NAME;
    },
  };
}

/** Sealed names shown as readable; without a cipher they stay hidden behind a placeholder. */
export function openMailboxNames<T extends { name: string }>(
  mailboxes: T[],
  cipher: MailboxNameCipher | null,
): Promise<T[]> {
  return Promise.all(
    mailboxes.map(async (mailbox) =>
      isSealedMailboxName(mailbox.name)
        ? {
            ...mailbox,
            name: cipher ? await cipher.open(mailbox.name) : UNREADABLE_MAILBOX_NAME,
          }
        : mailbox,
    ),
  );
}

/** `Mailbox/set` updates sealing every custom folder still named in plaintext; empty when there are none. */
export async function sealPlaintextMailboxNames(
  mailboxes: Array<{ id: string; name: string; role?: string | null }>,
  cipher: MailboxNameCipher,
): Promise<Record<string, { name: string }>> {
  const pending = mailboxes.filter(
    (mailbox) => isCustomMailbox(mailbox) && !isSealedMailboxName(mailbox.name),
  );
  const entries = await Promise.all(
    pending.map(
      async (mailbox) => [mailbox.id, { name: await cipher.seal(mailbox.name) }] as const,
    ),
  );
  return Object.fromEntries(entries);
}

function base64UrlLength(bytes: number): number {
  const rest = bytes % 3;
  return Math.floor(bytes / 3) * 4 + (rest === 0 ? 0 : rest + 1);
}

/** The server's name limit applies to the sealed name, so this is what validation measures. */
export function sealedMailboxNameLength(name: string): number {
  const bytes = textEncoder.encode(JSON.stringify(name)).length + GCM_TAG_BYTES;
  return SEALED_MAILBOX_NAME_PREFIX.length + SEALED_IV_LENGTH + 1 + base64UrlLength(bytes);
}

/** How many plain ASCII characters fit once sealed, for the length message. */
export function maxPlainMailboxNameLength(sealedLimit: number): number {
  const available = sealedLimit - SEALED_MAILBOX_NAME_PREFIX.length - SEALED_IV_LENGTH - 1;
  const bytes = Math.floor((available * 3) / 4);
  return Math.max(bytes - GCM_TAG_BYTES - 2, 0);
}
