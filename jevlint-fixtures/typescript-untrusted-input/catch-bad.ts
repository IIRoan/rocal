export function failureMessage(error: unknown): string {
  return (error as Error).message;
}
