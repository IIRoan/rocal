declare function resolveTimezone(timezone?: string): string;
declare function utcToPickerDate(instant: Date, timezone: string): Date;

export function getPickerDate(instant: Date, timezone?: string): Date {
  return utcToPickerDate(instant, resolveTimezone(timezone));
}
