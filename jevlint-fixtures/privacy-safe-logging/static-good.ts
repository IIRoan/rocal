declare const logger: {
  warn: (message: string, context: { count: number }) => void;
};

export function reportSkipped(count: number): void {
  logger.warn("Skipped reminders", { count });
}
