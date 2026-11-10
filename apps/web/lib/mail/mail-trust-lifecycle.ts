import { createMailTrustReviewBridge } from "@workspace/calendar-core/mail-key-continuity";

export const mailTrustReviewBridge = createMailTrustReviewBridge();
let generation = 0;
const listeners = new Set<() => void>();

export function subscribeMailTrustInvalidation(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function captureMailTrustGeneration(): () => boolean {
  const started = generation;
  return () => started === generation;
}
export function cancelMailTrustReview(): void {
  generation += 1;
  for (const listener of listeners) listener();
  mailTrustReviewBridge.cancel();
}

export async function reviewCurrentMailSenderKey(email: string): Promise<void> {
  const isCurrent = captureMailTrustGeneration();
  const trust = await import("./mail-trust");
  if (!isCurrent()) throw new Error("Mail encryption session changed.");
  await trust.reviewMailSenderKey(email);
}
