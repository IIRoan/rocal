import type { Schema } from "@workspace/api-contracts";

export type PasswordEnvelopeRequest = Schema<"PasswordEnvelopeRequest">;

/** An API that predates storing the envelope with the change leaves this flag out. */
function storedWithChange(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "envelopeStored" in data &&
    data.envelopeStored === true
  );
}

/** Changes the password with the envelope for the new one, and uploads it on its own when the API did not store it. */
export async function changePasswordWithEnvelope(input: {
  envelope: PasswordEnvelopeRequest;
  change: (envelope: PasswordEnvelopeRequest) => Promise<unknown>;
  upload: (envelope: PasswordEnvelopeRequest) => Promise<unknown>;
}): Promise<void> {
  const data = await input.change(input.envelope);
  if (!storedWithChange(data)) {
    await input.upload(input.envelope);
  }
}
