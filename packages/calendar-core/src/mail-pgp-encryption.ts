export type MailRecipientEncryptionInput = {
  plaintext: string;
  recipientPublicKeysArmored: string[];
};

type MailPgpEncryptionProvider<PublicKey, PrivateKey, Message> = {
  readKey: (input: { armoredKey: string }) => Promise<PublicKey>;
  createMessage: (input: { text: string }) => Promise<Message>;
  encrypt: (input: {
    message: Message;
    encryptionKeys: PublicKey[];
    signingKeys: PrivateKey;
    wildcard: true;
    format: "armored";
  }) => Promise<string>;
};

/** Every platform seals with anonymous recipient packets and the signing context captured before any await. */
export async function encryptMailForRecipients<PublicKey, PrivateKey, Message>(
  input: MailRecipientEncryptionInput,
  context: { signingKey: PrivateKey; isCurrent: () => boolean },
  provider: MailPgpEncryptionProvider<PublicKey, PrivateKey, Message>,
): Promise<{ armoredMessage: string }> {
  const assertCurrent = () => {
    if (!context.isCurrent()) {
      throw new Error("Mail encryption session changed. Please try again.");
    }
  };
  assertCurrent();
  const encryptionKeys = await Promise.all(
    input.recipientPublicKeysArmored.map((armoredKey) =>
      provider.readKey({ armoredKey }),
    ),
  );
  assertCurrent();
  const message = await provider.createMessage({ text: input.plaintext });
  assertCurrent();
  const armoredMessage = await provider.encrypt({
    message,
    encryptionKeys,
    signingKeys: context.signingKey,
    wildcard: true,
    format: "armored",
  });
  assertCurrent();
  return { armoredMessage };
}
