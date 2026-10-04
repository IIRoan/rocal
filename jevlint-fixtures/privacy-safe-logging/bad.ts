type Logger = {
  error: (message: string, context: Record<string, unknown>) => void;
};

export function logImportFailure(
  logger: Logger,
  email: string,
  token: string,
  error: Error,
  responseBody: string,
): void {
  logger.error("Calendar import failed", { email, token, error, responseBody });
}
