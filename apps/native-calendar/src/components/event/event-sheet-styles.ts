import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";

export function createEventSheetStyles(theme: ThemeTokens) {
  const view = {
    rsvpRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    rsvpButton: {
      flex: 1,
      minHeight: 44,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    rsvpButtonSelected: {
      borderColor: theme.colors.primaryBase,
      backgroundColor: theme.colors.primaryBase + "18",
    },
    rsvpButtonPressed: {
      opacity: 0.85,
    },
    viewBody: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 20,
    },
    viewScroll: {
      flex: 1,
    },
    viewTitleRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: 12,
      marginBottom: 12,
    },
    titleIcon: {
      height: 30,
      justifyContent: "center" as const,
    },
    cancelledBanner: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: 10,
      padding: 12,
      marginBottom: 12,
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.destructive + "40",
      backgroundColor: theme.colors.destructive + "0D",
    },
    viewRows: {
      gap: 4,
    },
    viewRowText: {
      paddingVertical: 12,
    },
    viewInlineRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      minHeight: 44,
    },

    editBody: {
      flex: 1,
      minHeight: 0,
    },
    viewHeaderRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
    },
    headerIconButton: {
      width: 36,
      height: 36,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.full,
    },
    headerIconButtonPressed: {
      backgroundColor: theme.colors.accent,
    },
    formHeader: {
      paddingVertical: theme.spacing["2"],
      borderBottomWidth: 0,
    },
    formHeaderRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    savePill: {
      minWidth: 72,
      height: 36,
      paddingHorizontal: theme.spacing["4"],
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primaryBase,
    },
    savePillPressed: {
      opacity: 0.8,
    },
    viewRowContent: {
      flex: 1,
    },
    participantList: {
      gap: 8,
      paddingBottom: 4,
    },
    participantRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
    },
    participantMeta: {
      flex: 1,
    },
    calendarDot: {
      width: 10,
      height: 10,
      borderRadius: theme.borderRadius.full,
    },
    errorContainer: {
      backgroundColor: theme.colors.destructive + "18",
      borderRadius: theme.borderRadius.sm,
      padding: 12,
      marginTop: 8,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay + "80",
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    modalContent: {
      width: "85%",
      backgroundColor: theme.colors.card,
      borderRadius: theme.borderRadius.lg,
      padding: 16,
    },
    scopeOption: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    cancelOption: {
      paddingVertical: 12,
      alignItems: "center" as const,
      marginTop: 8,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    rsvpButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    savePillText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    rsvpButtonTextSelected: {
      color: theme.colors.primaryBase,
    },
    viewHeaderTitle: {
      flex: 1,
    },
    viewEventTitle: {
      flex: 1,
      fontSize: theme.typography.fontSize.xl.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      lineHeight: theme.typography.fontSize.xl.lineHeight,
    },
    viewEventTitleCancelled: {
      color: theme.colors.mutedForeground,
      textDecorationLine: "line-through" as const,
    },
    viewSyncedHint: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
      marginTop: -6,
      marginBottom: 10,
      paddingLeft: 16,
    },
    viewMutedText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    cancelledTitle: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.destructive,
    },
    viewText: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    viewSubtext: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
      marginTop: 2,
    },
    viewDescription: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
    },
    errorText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.destructive,
    },
    modalTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: 12,
    },
    scopeOptionText: {
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
    },
    cancelOptionText: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type EventSheetStyles = ReturnType<typeof createEventSheetStyles>;
