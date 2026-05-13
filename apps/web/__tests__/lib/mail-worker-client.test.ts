/** @jest-environment jsdom */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { MailCryptoWorkerClient } from "../../lib/mail/worker-client-core";

type WorkerHandler<T = unknown> = ((event: T) => void) | null;

class MockWorker {
  static instances: MockWorker[] = [];

  public onmessage: WorkerHandler<
    MessageEvent<{ requestId: number; payload?: unknown; error?: string }>
  > = null;
  public onerror: WorkerHandler<ErrorEvent> = null;
  public onmessageerror: WorkerHandler<Event> = null;
  public readonly postMessage = jest.fn();
  public readonly terminate = jest.fn();

  constructor(
    public readonly url: URL,
    public readonly options: WorkerOptions,
  ) {
    MockWorker.instances.push(this);
  }

  emitMessage(data: { requestId: number; payload?: unknown; error?: string }) {
    this.onmessage?.({ data } as MessageEvent<typeof data>);
  }

  emitError(message = "Worker failed") {
    this.onerror?.({
      message,
      preventDefault: jest.fn(),
    } as unknown as ErrorEvent);
  }
}

describe("MailCryptoWorkerClient", () => {
  beforeEach(() => {
    MockWorker.instances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("terminates a failed worker and spawns a fresh one for the next request", async () => {
    const client = new MailCryptoWorkerClient(
      () =>
        new MockWorker(new URL("https://example.com/mail-crypto.worker.ts"), {
          type: "module",
        }) as unknown as Worker,
      { requestTimeoutMs: 1_000 },
    );

    const firstRequest = client.generateKeyPair({
      name: "Alice",
      email: "alice@solace.onl",
      privateKeyPassphrase: "hunter2",
    });
    const firstWorker = MockWorker.instances[0];

    firstWorker.emitError("Mail crypto worker failed.");

    await expect(firstRequest).rejects.toThrow("Mail crypto worker failed.");
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);

    const secondRequest = client.generateKeyPair({
      name: "Bob",
      email: "bob@solace.onl",
      privateKeyPassphrase: "hunter2",
    });
    const secondWorker = MockWorker.instances[1];

    expect(secondWorker).toBeDefined();
    expect(secondWorker).not.toBe(firstWorker);

    secondWorker.emitMessage({
      requestId: 2,
      payload: {
        publicKeyArmored: "public",
        privateKeyArmored: "private",
        revocationCertificate: "revoke",
        fingerprint: "ABCD",
      },
    });

    await expect(secondRequest).resolves.toEqual({
      publicKeyArmored: "public",
      privateKeyArmored: "private",
      revocationCertificate: "revoke",
      fingerprint: "ABCD",
    });
  });

  it("times out stuck requests and clears pending entries", async () => {
    const client = new MailCryptoWorkerClient(
      () =>
        new MockWorker(new URL("https://example.com/mail-crypto.worker.ts"), {
          type: "module",
        }) as unknown as Worker,
      { requestTimeoutMs: 25 },
    );

    const request = client.decryptMessage({
      armoredMessage: "ciphertext",
    });
    const worker = MockWorker.instances[0];

    jest.advanceTimersByTime(25);

    await expect(request).rejects.toThrow(
      "Mail crypto worker request timed out after 25ms.",
    );
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(
      (client as unknown as { pending: Map<number, unknown> }).pending.size,
    ).toBe(0);
  });
});
