/** Built-ins the shipped Hermes (react-native/sdks/.hermesv1version) lacks: jest.setup.ts deletes them and repo rule hermes-safe-builtins bans them. */
export const HERMES_MISSING_BUILTINS = [
  "Array.prototype.toSorted",
  "Array.fromAsync",
  "Object.groupBy",
  "Map.groupBy",
  "Intl.DisplayNames",
  "Intl.DurationFormat",
  "Intl.ListFormat",
  "Intl.Locale",
  "Intl.PluralRules",
  "Intl.RelativeTimeFormat",
  "Intl.Segmenter",
  "Intl.supportedValuesOf",
  "Intl.DateTimeFormat.prototype.formatRange",
  "Intl.DateTimeFormat.prototype.formatRangeToParts",
  "Intl.NumberFormat.prototype.formatRange",
  "Intl.NumberFormat.prototype.formatRangeToParts",
] as const;
