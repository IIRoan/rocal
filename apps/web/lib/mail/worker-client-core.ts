import type { GenerateKeyPairResult, MailDecryptResult } from "./types";

type WorkerMessage = {
  requestId: number;
  type: string;
  payload?: Record<string, unknown>;
  error?: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export type MailVaultVerificationContext = {
  readonly ownerUserId?: string;
  readonly publicKeyArmored: string;
  readonly fingerprint: string;
  readonly ownAddresses: readonly string[];
};

export class MailCryptoWorkerClient {
  private static readonly DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

  private worker: Worker | null = null;
  private vaultGeneration = 0;
  private verificationContext: MailVaultVerificationContext | null = null;
  private requestId = 0;
  private readonly requestTimeoutMs: number;
  private readonly createWorker: () => Worker;
  private pending = new Map<number, PendingRequest>();

  constructor(
    createWorker: () => Worker,
    options: { requestTimeoutMs?: number } = {},
  ) {
    this.createWorker = createWorker;
    this.requestTimeoutMs =
      options.requestTimeoutMs ??
      MailCryptoWorkerClient.DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private nextRequestId(): number {
    this.requestId += 1;
    if (this.requestId > Number.MAX_SAFE_INTEGER) {
      this.requestId = 1;
    }
    return this.requestId;
  }

  private settlePending(
    requestId: number,
    callback: (entry: PendingRequest) => void,
  ) {
    const entry = this.pending.get(requestId);
    if (!entry) {
      return;
    }

    this.pending.delete(requestId);
    clearTimeout(entry.timeoutId);
    callback(entry);
  }

  private rejectAllPending(error: Error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timeoutId);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private resetWorker(worker: Worker) {
    this.vaultGeneration += 1;
    this.verificationContext = null;
    worker.terminate();
    if (this.worker === worker) {
      this.worker = null;
    }
  }

  private getWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }

    const worker = this.createWorker();

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      this.settlePending(event.data.requestId, (entry) => {
        if (event.data.error) {
          entry.reject(new Error(event.data.error));
          return;
        }

        entry.resolve(event.data.payload);
      });
    };

    worker.onerror = (event) => {
      const error = new Error(event.message || "Mail crypto worker failed.");
      event.preventDefault?.();
      this.rejectAllPending(error);
      this.resetWorker(worker);
    };

    worker.onmessageerror = () => {
      const error = new Error(
        "Mail crypto worker returned an unreadable response.",
      );
      this.rejectAllPending(error);
      this.resetWorker(worker);
    };

    this.worker = worker;
    return worker;
  }

  private call<T = unknown>(
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<T> {
    const requestId = this.nextRequestId();
    const worker = this.getWorker();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error(
          `Mail crypto worker request timed out after ${this.requestTimeoutMs}ms.`,
        );
        this.rejectAllPending(error);
        this.resetWorker(worker);
      }, this.requestTimeoutMs);

      this.pending.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
        timeoutId,
      });

      try {
        worker.postMessage({ requestId, type, payload });
      } catch (error) {
        clearTimeout(timeoutId);
        this.pending.delete(requestId);
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to post message to the mail crypto worker."),
        );
        this.resetWorker(worker);
      }
    });
  }

  generateKeyPair(input: {
    name: string;
    email: string;
    privateKeyPassphrase: string;
  }): Promise<GenerateKeyPairResult> {
    return this.call<GenerateKeyPairResult>("GENERATE_PGP_KEYPAIR", input);
  }

  async loadVault(input: {
    privateKeyArmored: string;
    privateKeyPassphrase: string;
    publicKeyArmored: string;
    ownAddresses?: readonly string[];
    ownerUserId?: string;
  }): Promise<{ fingerprint: string }> {
    const generation = ++this.vaultGeneration;
    this.verificationContext = null;
    const { ownAddresses, ownerUserId, ...payload } = input;
    const result = await this.call<{ fingerprint: string }>("LOAD_ACTIVE_VAULT", payload);
    if (generation !== this.vaultGeneration) throw new Error("Mail encryption session changed.");
    this.verificationContext = Object.freeze({
      ownerUserId,
      publicKeyArmored: input.publicKeyArmored,
      fingerprint: result.fingerprint,
      ownAddresses: Object.freeze([...(ownAddresses ?? [])]),
    });
    return result;
  }

  async inspectPublicKey(input: { armoredKey: string; knownArmoredKey?: string; forEncryption: boolean }): Promise<{ fingerprint: string; publicKeyArmored: string }> {
    const generation = this.vaultGeneration;
    const result = await this.call<{ fingerprint: string; publicKeyArmored: string }>("INSPECT_PUBLIC_KEY", input);
    if (generation !== this.vaultGeneration) throw new Error("Mail encryption session changed.");
    return result;
  }

  getVerificationContext(): MailVaultVerificationContext | null {
    return this.verificationContext;
  }

  isVerificationContextCurrent(context: MailVaultVerificationContext): boolean {
    return this.verificationContext === context;
  }

  async decryptMessage(input: {
    armoredMessage: string;
    senderPublicKeyArmored?: string;
    expectedVaultFingerprint?: string;
    /** A draft about to be edited keeps its whole HTML instead of the read limit. */
    editable?: boolean;
  }): Promise<MailDecryptResult> {
    const generation = this.vaultGeneration;
    const result = await this.call<MailDecryptResult>("DECRYPT_PGP_MESSAGE", input);
    if (generation !== this.vaultGeneration) throw new Error("Mail encryption session changed.");
    return result;
  }

  encryptForRecipients(input: {
    plaintext: string;
    recipientPublicKeysArmored: string[];
  }): Promise<{ armoredMessage: string }> {
    return this.call<{ armoredMessage: string }>(
      "ENCRYPT_FOR_RECIPIENTS",
      input,
    );
  }

  clear(): Promise<{ cleared: boolean }> {
    this.vaultGeneration += 1;
    this.verificationContext = null;
    if (!this.worker) {
      return Promise.resolve({ cleared: true });
    }
    return this.call<{ cleared: boolean }>("CLEAR_ACTIVE_VAULT");
  }

  dispose(): void {
    this.vaultGeneration += 1;
    this.verificationContext = null;
    this.rejectAllPending(new Error("Mail encryption session ended."));
    if (this.worker) this.resetWorker(this.worker);
  }

  deriveVaultKey(input: {
    password: string;
    kdfParams: import("./types").MailVaultKdfParams;
  }): Promise<{ keyB64: string }> {
    return this.call<{ keyB64: string }>("DERIVE_VAULT_KEY", input);
  }
}
