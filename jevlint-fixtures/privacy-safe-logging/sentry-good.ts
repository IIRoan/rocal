declare const Sentry: { captureException: (error: unknown) => void };

export function reportFailure(error: unknown): void {
  Sentry.captureException(error);
}
