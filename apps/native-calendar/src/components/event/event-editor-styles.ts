import type { TextStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";

export const EDITOR_CONTROL_HEIGHT = 44;

/** Borderless text input style for use inside EventEditorField. */
export function createEditorInputStyle(theme: ThemeTokens): TextStyle {
  return {
    flex: 1,
    minWidth: 0,
    minHeight: EDITOR_CONTROL_HEIGHT,
    paddingVertical: 0,
    fontSize: theme.typography.fontSize.sm.size,
    color: theme.colors.foreground,
  };
}

/** Filled field style with a visible resting background so empty fields stay findable. */
export function createEditorFieldStyle(theme: ThemeTokens): TextStyle {
  return {
    minHeight: EDITOR_CONTROL_HEIGHT,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent + "66",
    paddingHorizontal: theme.spacing["3"],
    fontSize: theme.typography.fontSize.sm.size,
    color: theme.colors.foreground,
  };
}
