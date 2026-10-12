import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  createEditorFieldStyle,
  createEditorInputStyle,
} from "./event-editor-styles";

export function createEventFormStyles(theme: ThemeTokens) {
  const field = createEditorFieldStyle(theme);

  const view = {
    container: {
      flex: 1,
      minHeight: 0,
      backgroundColor: "transparent",
    },
    scrollView: {
      flex: 1,
      minHeight: 0,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: theme.spacing["4"],
    },
    formInner: {
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["2"],
      gap: theme.spacing["2"],
    },
    errorContainer: {
      backgroundColor: theme.colors.destructive + "18",
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing["3"],
      gap: theme.spacing["1"],
    },
    pairRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
    },
    pairItem: {
      flex: 1,
      minWidth: 0,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: theme.spacing["1"],
      backgroundColor: theme.colors.border,
    },
    dateTimeSheetBody: {
      paddingHorizontal: theme.spacing["4"],
      paddingBottom: theme.spacing["2"],
    },
    dateTimeSheetActions: {
      marginTop: theme.spacing["4"],
    },
    participantSection: {
      gap: theme.spacing["2"],
    },
    reminderRemove: {
      width: 28,
      height: 28,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.full,
    },
    reminderRemovePressed: {
      backgroundColor: theme.colors.accent,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    titleInput: {
      ...field,
      minHeight: 48,
      fontSize: theme.typography.fontSize.lg.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    input: createEditorInputStyle(theme),
    textarea: {
      minHeight: 120,
      paddingTop: 13,
      paddingBottom: 10,
    },
    fieldError: {
      paddingTop: 4,
      paddingHorizontal: 4,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
    },
    errorText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type EventFormStyles = ReturnType<typeof createEventFormStyles>;
