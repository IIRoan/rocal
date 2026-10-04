declare function logRef(value: string): string;
declare function errorLogDetails(error: unknown): Record<string, unknown>;

type Logger = {
  warn: (message: string, context: Record<string, unknown>) => void;
};

export function logImportFailure(
  logger: Logger,
  accountId: string,
  error: unknown,
): void {
  logger.warn("Calendar import failed", {
    accountRef: logRef(accountId),
    ...errorLogDetails(error),
  });
}
