/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useConversationDecryptedPreviews } from "./use-conversation-decrypted-previews";
import { decryptEncryptedMessage } from "./mail-sender-key";
import type { MailRuntime } from "./mail-runtime";
import type { MailDecryptResult } from "./mail-crypto";

jest.mock("./mail-sender-key", () => ({ decryptEncryptedMessage: jest.fn() }));

const messages = ["first", "second", "opened"].map((id) => ({
  id,
  textBody: [{ partId: "text" }],
  bodyValues: {
    text: {
      value:
        "-----BEGIN PGP MESSAGE-----\nciphertext\n-----END PGP MESSAGE-----",
    },
  },
}));
const runtime = {} as MailRuntime;
const decrypted: MailDecryptResult = {
  plaintext: "Decrypted preview",
  signatureVerificationState: "verified",
  hasVerifiedSignature: true,
};

describe("preview decryption scheduling", () => {
  it.each([false, true])(
    "bypasses the queue for readers and cancels abandoned previews (unmount: %s)",
    async (unmountBeforeOpening) => {
      (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = true;
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const root = createRoot(document.createElement("div"));
      const releases: (() => void)[] = [];
      const decrypt = jest.mocked(decryptEncryptedMessage);
      decrypt.mockImplementation(async (_runtime, message) => {
        if (message.id !== "opened") {
          await new Promise<void>((resolve) => releases.push(resolve));
        }
        return decrypted;
      });
      function Previews() {
        useConversationDecryptedPreviews(runtime, messages);
        return null;
      }
      try {
        await act(async () =>
          root.render(
            <QueryClientProvider client={client}>
              <Previews />
            </QueryClientProvider>,
          ),
        );
        expect(decrypt.mock.calls.map(([, message]) => message.id)).toEqual([
          "first",
          "second",
        ]);

        if (unmountBeforeOpening) {
          await act(async () => root.unmount());
        }

        if (!unmountBeforeOpening) {
          const readerDecrypt = jest.fn(async () => decrypted);
          await act(async () => {
            void client.fetchQuery({
              queryKey: QUERY_KEYS.mailDecrypted("opened"),
              queryFn: readerDecrypt,
              staleTime: Infinity,
            });
            await Promise.resolve();
          });
          expect(readerDecrypt).toHaveBeenCalledTimes(1);
          expect(
            client.getQueryData(QUERY_KEYS.mailDecrypted("opened")),
          ).toEqual(decrypted);
        }

        await act(async () => {
          releases.forEach((release) => release());
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(decrypt.mock.calls.map(([, message]) => message.id)).toEqual([
          "first",
          "second",
        ]);
        if (unmountBeforeOpening) {
          expect(
            client.getQueryData(QUERY_KEYS.mailDecrypted("opened")),
          ).toBeUndefined();
        }
      } finally {
        await act(async () => {
          if (!unmountBeforeOpening) root.unmount();
          releases.forEach((release) => release());
        });
        client.clear();
        decrypt.mockReset();
      }
    },
  );
});
