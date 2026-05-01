/**
 * Re-exports design tokens from the shared package.
 *
 * For Tailwind CSS styling, use the CSS custom properties defined in globals.css.
 * For programmatic access to token values (e.g., in JS/TS code that needs color values),
 * import from this module.
 *
 * The CSS custom properties in globals.css are the source of truth for Tailwind v4.
 * The values in @workspace/design-tokens match those CSS properties and serve as
 * the single source of truth for the native app's ThemeProvider.
 */
export {
  lightTheme,
  darkTheme,
  toTailwindTheme,
  type ThemeTokens,
  type CalendarColor,
  type CalendarColorValue,
  type ColorScale,
  type ShadowTokenValue,
} from "@workspace/design-tokens";
