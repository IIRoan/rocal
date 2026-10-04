export function moveEventToLocalStart(instant: Date): Date {
  instant.setHours(0, 0, 0, 0);
  return instant;
}
