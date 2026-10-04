declare function encryptEventContentRequest<T>(
  encrypter: unknown,
  session: unknown,
  request: T,
): Promise<{ encryptedContent: string }>;

export function buildEncryptedEventRequest(
  encrypter: unknown,
  session: unknown,
  request: { title: string; description: string },
) {
  return encryptEventContentRequest(encrypter, session, request);
}
