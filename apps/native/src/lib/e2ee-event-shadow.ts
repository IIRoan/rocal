/**
 * Event ciphertext always includes title, description, and location together.
 * Time-only patches must not attach a shadow or the backend will persist empty
 * plaintext fields and wipe the stored title and details.
 */
export function shouldAttachEventContentEncryption(request: object): boolean {
  if (!Object.prototype.hasOwnProperty.call(request, "title")) {
    return false;
  }

  const title = (request as { title?: string | null }).title;
  return Boolean(title?.trim());
}
