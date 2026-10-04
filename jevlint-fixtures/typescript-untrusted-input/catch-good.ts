export function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation failed";
}
