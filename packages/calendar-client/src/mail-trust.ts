import {
  MAIL_TRUST_MAX_CIPHERTEXT_LENGTH,
  MailTrustBlockedError,
  normalizeMailTrustAddress,
  observeMailTrustKey,
  parseMailTrustState,
  type MailTrustObservedKey,
  type MailSenderVerification,
  type MailTrustProblem,
  type MailTrustReviewAction,
  type MailTrustState,
  type MailTrustPin,
} from "@workspace/calendar-core";
import { z } from "@workspace/calendar-core/zod";
import type { Schema } from "@workspace/api-contracts";
import type { HttpClient } from "./http-client";

const mailTrustResponseSchema = z
  .object({
    encryptedTrust: z.string().max(MAIL_TRUST_MAX_CIPHERTEXT_LENGTH).nullable(),
  })
  .strict();
export type MailTrustResponse = Schema<"MailTrust">;
export type PutMailTrustRequest = Schema<"PutMailTrustRequest">;
function parseMailTrustResponse(value: unknown): MailTrustResponse {
  const parsed = mailTrustResponseSchema.parse(value);
  return { encryptedTrust: parsed.encryptedTrust };
}

export class MailTrustApiService {
  constructor(
    private readonly client: HttpClient,
    private readonly isCurrent: () => boolean,
  ) {}
  private requestOptions() {
    return {
      retries: 0,
      isCurrent: this.isCurrent,
    };
  }
  async get(): Promise<MailTrustResponse> {
    return parseMailTrustResponse(
      await this.client.get<MailTrustResponse>(
        "/api/mail/trust",
        this.requestOptions(),
      ),
    );
  }
  async put(body: PutMailTrustRequest): Promise<MailTrustResponse> {
    return parseMailTrustResponse(
      await this.client.put<MailTrustResponse>(
        "/api/mail/trust",
        body,
        this.requestOptions(),
      ),
    );
  }
}

export type MailTrustClientOptions = {
  accountId: string;
  isCurrent: () => boolean;
  read: (fresh?: boolean) => Promise<MailTrustResponse>;
  write: (body: PutMailTrustRequest) => Promise<MailTrustResponse>;
  encryptJson: (value: unknown, aad: string) => Promise<string>;
  decryptJson: (encrypted: string, aad: string) => Promise<unknown>;
  readAnchor: () => Promise<number | null>;
  markEstablished: (revision: number) => Promise<void>;
  inspectKey: (
    armored: string,
    knownArmored?: string,
    purpose?: "send" | "verify",
  ) => Promise<MailTrustObservedKey>;
  now?: () => string;
};

type OpenedTrust = { state: MailTrustState; encryptedTrust: string | null };

function openTrustCiphertext(ciphertext: string): string {
  const match = /^mt([0-9]+)\./.exec(ciphertext);
  if (match && Number(match[1]) > 1)
    throw new MailTrustBlockedError({ kind: "update_required" });
  if (!ciphertext.startsWith("mt1."))
    throw new MailTrustBlockedError({ kind: "unavailable" });
  return ciphertext.slice(4);
}

export class MailTrustClient {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly aad: string;
  private highestRevision: number | null = null;
  private localAnchorAvailable = true;
  constructor(private readonly options: MailTrustClientOptions) {
    this.aad = `mail-trust:v1:${options.accountId}`;
  }
  private assertCurrent() {
    if (!this.options.isCurrent())
      throw new Error("Mail encryption session changed.");
  }
  private async checked<T>(operation: () => Promise<T>): Promise<T> {
    this.assertCurrent();
    const result = await operation();
    this.assertCurrent();
    return result;
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
  private async readRaw(fresh = false): Promise<MailTrustResponse> {
    try {
      return parseMailTrustResponse(
        await this.checked(() => this.options.read(fresh)),
      );
    } catch (error: unknown) {
      this.assertCurrent();
      if (error instanceof MailTrustBlockedError) throw error;
      throw new MailTrustBlockedError({ kind: "unavailable" });
    }
  }
  private async readHighestRevision(): Promise<number | null> {
    try {
      const saved = await this.checked(this.options.readAnchor);
      if (saved !== null)
        this.highestRevision = Math.max(this.highestRevision ?? 0, saved);
      this.localAnchorAvailable = true;
    } catch {
      this.assertCurrent();
      this.localAnchorAvailable = false;
    }
    return this.highestRevision;
  }
  private async rememberRevision(revision: number): Promise<void> {
    if (this.highestRevision !== null && revision < this.highestRevision)
      throw new MailTrustBlockedError({ kind: "rollback" });
    this.highestRevision = Math.max(this.highestRevision ?? 0, revision);
    try {
      await this.checked(() =>
        this.options.markEstablished(this.highestRevision ?? revision),
      );
      this.localAnchorAvailable = true;
    } catch (error: unknown) {
      this.assertCurrent();
      this.localAnchorAvailable = false;
      if (error instanceof MailTrustBlockedError) throw error;
    }
  }
  private async decryptState(ciphertext: string): Promise<MailTrustState> {
    const value = await this.checked(() =>
      this.options.decryptJson(openTrustCiphertext(ciphertext), this.aad),
    );
    return parseMailTrustState(value);
  }
  private async open(fresh = false): Promise<OpenedTrust> {
    // Another tab can advance the anchor during the request, so read it after the response.
    const { encryptedTrust, highest } = await this.readRaw(fresh).then(async ({ encryptedTrust }) => ({
      encryptedTrust,
      highest: await this.readHighestRevision(),
    }));
    try {
      if (encryptedTrust === null) {
        if (highest !== null)
          throw new MailTrustBlockedError({ kind: "missing" });
        return { state: { version: 1, revision: 0, pins: [] }, encryptedTrust };
      }
      const state = await this.decryptState(encryptedTrust);
      if (highest !== null && state.revision < highest)
        throw new MailTrustBlockedError({ kind: "rollback" });
      await this.rememberRevision(state.revision);
      return { state, encryptedTrust };
    } catch (error: unknown) {
      this.assertCurrent();
      const problem: MailTrustProblem =
        error instanceof MailTrustBlockedError
          ? error.problem
          : { kind: "unavailable" };
      if (!fresh && (problem.kind === "missing" || problem.kind === "rollback"))
        return this.open(true);
      throw new MailTrustBlockedError({
        ...problem,
        expectedEncryptedTrust: encryptedTrust,
        resetAllowed: problem.kind !== "update_required",
      });
    }
  }
  private async inspectSavedPin(
    pin: MailTrustPin,
  ): Promise<MailTrustObservedKey> {
    try {
      const key = await this.checked(() =>
        this.options.inspectKey(pin.publicKeyArmored, undefined, "verify"),
      );
      if (key.fingerprint !== pin.fingerprint)
        throw new Error("Invalid saved key.");
      return key;
    } catch {
      this.assertCurrent();
      throw new MailTrustBlockedError({
        kind: "unavailable",
        email: pin.email,
        resetAllowed: true,
      });
    }
  }
  private async verificationPin(email: string) {
    const { state } = await this.open();
    const pin = state.pins.find((candidate) => candidate.email === email);
    return pin ? this.inspectSavedPin(pin) : undefined;
  }
  async lookupVerificationKey(emailInput: string): Promise<string | undefined> {
    return (await this.verificationPin(normalizeMailTrustAddress(emailInput)))
      ?.publicKeyArmored;
  }
  async verifySender(
    email: string,
    lookupDirectory: () => Promise<string>,
  ): Promise<MailSenderVerification> {
    let saved: MailTrustObservedKey | undefined;
    try {
      saved = await this.verificationPin(normalizeMailTrustAddress(email));
    } catch (error: unknown) {
      this.assertCurrent();
      if (!(error instanceof MailTrustBlockedError)) throw error;
      const kind = error.problem.kind;
      return {
        senderKeyTrustState:
          kind === "missing" ||
          kind === "rollback" ||
          kind === "update_required"
            ? { kind }
            : { kind: "unavailable", reason: "history" },
      };
    }
    if (!saved) return { senderKeyTrustState: { kind: "unpinned" } };
    try {
      const current = await this.checked(lookupDirectory);
      const offered = await this.checked(() =>
        this.options.inspectKey(current, undefined, "send"),
      );
      return {
        senderPublicKeyArmored: saved.publicKeyArmored,
        senderKeyTrustState:
          saved.fingerprint === offered.fingerprint
            ? this.localAnchorAvailable
              ? { kind: "pinned" }
              : { kind: "unavailable", reason: "local" }
            : {
                kind: "key_changed",
                oldFingerprint: saved.fingerprint,
                newFingerprint: offered.fingerprint,
              },
      };
    } catch {
      this.assertCurrent();
      return {
        senderPublicKeyArmored: saved.publicKeyArmored,
        senderKeyTrustState: { kind: "unavailable", reason: "directory" },
      };
    }
  }

  ensureRecipient(
    emailInput: string,
    armored: string,
    reviewed?: { oldFingerprint: string; newFingerprint: string },
  ): Promise<string> {
    return this.enqueue(async () => {
      const email = normalizeMailTrustAddress(emailInput);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const opened = await this.open(true);
        try {
          const pin = opened.state.pins.find(
            (candidate) => candidate.email === email,
          );
          if (pin) await this.inspectSavedPin(pin);
          const key = await this.checked(() =>
            this.options.inspectKey(armored, pin?.publicKeyArmored, "send"),
          );
          if (reviewed && key.fingerprint !== reviewed.newFingerprint)
            throw new MailTrustBlockedError({ kind: "review_changed", email });
          const next = observeMailTrustKey(
            opened.state,
            email,
            key,
            this.options.now?.() ?? new Date().toISOString(),
            reviewed?.oldFingerprint,
          );
          if (next === opened.state) return key.publicKeyArmored;
          const encryptedTrust = `mt1.${await this.checked(() => this.options.encryptJson(next, this.aad))}`;
          if (
            encryptedTrust.length <= 4 ||
            encryptedTrust.length > MAIL_TRUST_MAX_CIPHERTEXT_LENGTH
          )
            throw new MailTrustBlockedError({ kind: "capacity", email });
          try {
            const response = await this.checked(() =>
              this.options.write({
                encryptedTrust,
                expectedEncryptedTrust: opened.encryptedTrust,
              }),
            );
            if (response.encryptedTrust !== encryptedTrust)
              throw new MailTrustBlockedError({ kind: "unavailable" });
            await this.rememberRevision(next.revision);
            return key.publicKeyArmored;
          } catch (error: unknown) {
            this.assertCurrent();
            if (
              error &&
              typeof error === "object" &&
              "statusCode" in error &&
              error.statusCode === 409
            )
              continue;
            throw error;
          }
        } catch (error: unknown) {
          this.assertCurrent();
          const problem: MailTrustProblem =
            error instanceof MailTrustBlockedError
              ? error.problem
              : { kind: "unavailable" };
          throw new MailTrustBlockedError({
            ...problem,
            email,
            expectedEncryptedTrust: opened.encryptedTrust,
            resetAllowed:
              problem.resetAllowed === true || problem.kind === "capacity",
            ...(problem.kind === "capacity"
              ? {
                  removablePins: opened.state.pins.map(
                    ({ email: savedEmail, fingerprint }) => ({
                      email: savedEmail,
                      fingerprint,
                    }),
                  ),
                }
              : {}),
          });
        }
      }
      throw new MailTrustBlockedError({ kind: "review_changed", email });
    });
  }
  reset(problem: MailTrustProblem): Promise<void> {
    return this.enqueue(async () => {
      if (
        problem.resetAllowed !== true ||
        problem.expectedEncryptedTrust === undefined ||
        !["unavailable", "missing", "rollback", "capacity"].includes(
          problem.kind,
        )
      )
        throw new MailTrustBlockedError({ kind: "review_changed" });
      const current = await this.readRaw(true);
      if (current.encryptedTrust !== problem.expectedEncryptedTrust)
        throw new MailTrustBlockedError({ kind: "review_changed" });
      if (problem.kind === "rollback" && current.encryptedTrust === null)
        throw new MailTrustBlockedError({ kind: "review_changed" });
      const highest = (await this.readHighestRevision()) ?? 0;
      let revision = highest;
      if (current.encryptedTrust !== null) {
        let readable: MailTrustState | null = null;
        try {
          readable = await this.decryptState(current.encryptedTrust);
        } catch (error: unknown) {
          this.assertCurrent();
          if (
            error instanceof MailTrustBlockedError &&
            error.problem.kind === "update_required"
          )
            throw error;
        }
        if (
          problem.kind === "rollback" &&
          (!readable || readable.revision >= highest)
        )
          throw new MailTrustBlockedError({ kind: "review_changed" });
        if (readable) {
          revision = Math.max(revision, readable.revision);
          if (problem.kind !== "capacity" && problem.kind !== "rollback") {
            const suspect = readable.pins.find(
              (pin) => pin.email === problem.email,
            );
            if (!suspect)
              throw new MailTrustBlockedError({ kind: "review_changed" });
            let corrupt = false;
            try {
              const key = await this.checked(() =>
                this.options.inspectKey(
                  suspect.publicKeyArmored,
                  undefined,
                  "verify",
                ),
              );
              corrupt = key.fingerprint !== suspect.fingerprint;
            } catch {
              this.assertCurrent();
              corrupt = true;
            }
            if (!corrupt)
              throw new MailTrustBlockedError({ kind: "review_changed" });
          }
        }
      }
      const encryptedTrust = `mt1.${await this.checked(() => this.options.encryptJson(parseMailTrustState({ version: 1, revision: revision + 1, pins: [] }), this.aad))}`;
      if (
        encryptedTrust.length <= 4 ||
        encryptedTrust.length > MAIL_TRUST_MAX_CIPHERTEXT_LENGTH
      )
        throw new MailTrustBlockedError({ kind: "capacity" });
      const response = await this.checked(() =>
        this.options.write({
          encryptedTrust,
          expectedEncryptedTrust: current.encryptedTrust,
        }),
      );
      if (response.encryptedTrust !== encryptedTrust)
        throw new MailTrustBlockedError({ kind: "unavailable" });
      await this.rememberRevision(revision + 1);
    });
  }
  removePin(
    problem: MailTrustProblem,
    selected: { email: string; fingerprint: string },
  ): Promise<void> {
    return this.enqueue(async () => {
      if (
        problem.kind !== "capacity" ||
        problem.expectedEncryptedTrust === undefined
      )
        throw new MailTrustBlockedError({ kind: "review_changed" });
      const opened = await this.open(true);
      const pin = opened.state.pins.find(
        (candidate) => candidate.email === selected.email,
      );
      if (
        opened.encryptedTrust !== problem.expectedEncryptedTrust ||
        pin?.fingerprint !== selected.fingerprint
      )
        throw new MailTrustBlockedError({ kind: "review_changed" });
      const next = parseMailTrustState({
        ...opened.state,
        revision: opened.state.revision + 1,
        pins: opened.state.pins.filter(
          (candidate) => candidate.email !== selected.email,
        ),
      });
      const encryptedTrust = `mt1.${await this.checked(() => this.options.encryptJson(next, this.aad))}`;
      const result = await this.checked(() =>
        this.options.write({
          encryptedTrust,
          expectedEncryptedTrust: opened.encryptedTrust,
        }),
      );
      if (result.encryptedTrust !== encryptedTrust)
        throw new MailTrustBlockedError({ kind: "unavailable" });
      await this.rememberRevision(next.revision);
    });
  }
}

export function createMailTrustAnchor(options: {
  accountId: string;
  readCiphertext: () => Promise<string | null>;
  writeCiphertext: (ciphertext: string) => Promise<void>;
  encryptJson: MailTrustClientOptions["encryptJson"];
  decryptJson: MailTrustClientOptions["decryptJson"];
}) {
  const aad = `mail-trust-anchor:v1:${options.accountId}`;
  let highest: number | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
  const readSaved = async (): Promise<number | null> => {
    const ciphertext = await options.readCiphertext();
    if (ciphertext === null) return highest;
    const value = await options.decryptJson(ciphertext, aad);
    const parsed = z
      .object({
        version: z.literal(1),
        revision: z
          .number()
          .int()
          .min(0)
          .max(Number.MAX_SAFE_INTEGER - 1),
      })
      .strict()
      .safeParse(value);
    if (!parsed.success)
      throw new Error("Local key-history revision is unavailable.");
    highest = Math.max(highest ?? 0, parsed.data.revision);
    return highest;
  };
  return {
    read: (): Promise<number | null> => serialize(readSaved),
    mark: (revision: number): Promise<void> =>
      serialize(async () => {
        const saved = await readSaved();
        if (saved !== null && saved > revision)
          throw new MailTrustBlockedError({ kind: "rollback" });
        const ciphertext = await options.encryptJson(
          { version: 1, revision },
          aad,
        );
        await options.writeCiphertext(ciphertext);
        highest = revision;
      }),
  };
}

export async function resolveMailTrustRecipient(input: {
  client: MailTrustClient;
  email: string;
  lookup: () => Promise<string>;
  review: (problem: MailTrustProblem) => Promise<MailTrustReviewAction>;
  isCurrent: () => boolean;
}): Promise<string> {
  const assertCurrent = () => {
    if (!input.isCurrent()) throw new Error("Mail encryption session changed.");
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assertCurrent();
    const armored = await input.lookup();
    assertCurrent();
    try {
      return await input.client.ensureRecipient(input.email, armored);
    } catch (error: unknown) {
      assertCurrent();
      if (!(error instanceof MailTrustBlockedError)) throw error;
      const action = await input.review(error.problem);
      assertCurrent();
      if (action === "cancel") throw error;
      if (typeof action === "object" && action.kind === "remove") {
        await input.client.removePin(error.problem, action);
        assertCurrent();
        continue;
      }
      if (action === "reset") {
        await input.client.reset(error.problem);
        assertCurrent();
        throw new MailTrustBlockedError({ kind: "reset_complete" });
      }
      if (
        action === "approve" &&
        error.problem.kind === "changed" &&
        error.problem.oldFingerprint &&
        error.problem.newFingerprint
      ) {
        const refreshed = await input.lookup();
        assertCurrent();
        return input.client.ensureRecipient(input.email, refreshed, {
          oldFingerprint: error.problem.oldFingerprint,
          newFingerprint: error.problem.newFingerprint,
        });
      }
    }
  }
  throw new MailTrustBlockedError({ kind: "unavailable" });
}

export async function reviewMailTrustSender(input: {
  client: MailTrustClient;
  email: string;
  lookup: () => Promise<string>;
  review: (problem: MailTrustProblem) => Promise<MailTrustReviewAction>;
  isCurrent: () => boolean;
}): Promise<void> {
  const assertCurrent = () => {
    if (!input.isCurrent()) throw new Error("Mail encryption session changed.");
  };
  assertCurrent();
  const result = await input.client.verifySender(input.email, input.lookup);
  assertCurrent();
  const state = result.senderKeyTrustState;
  if (state?.kind !== "key_changed") return;
  const action = await input.review({
    kind: "changed",
    email: normalizeMailTrustAddress(input.email),
    oldFingerprint: state.oldFingerprint,
    newFingerprint: state.newFingerprint,
  });
  assertCurrent();
  if (action !== "approve") return;
  const offered = await input.lookup();
  assertCurrent();
  await input.client.ensureRecipient(input.email, offered, {
    oldFingerprint: state.oldFingerprint,
    newFingerprint: state.newFingerprint,
  });
  assertCurrent();
}
