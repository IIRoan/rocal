import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  PARTICIPANTS_INVITE_HELP_TEXT,
  type EventParticipantInput,
  type RecentContactEntry,
} from "@workspace/calendar-core";
import { useTheme } from "../../providers/ThemeProvider";
import { RecipientSuggestInput } from "../mail/RecipientSuggestInput";
import { BlobatarAvatar } from "../BlobatarAvatar";
import { SheetActions, SheetPrimaryButton } from "../sheet";
import { PickerSheet } from "./EventPickerSheets";
import { createEditorFieldStyle } from "./EventEditorPrimitives";

const FIELD_ICON_SIZE = 16;
const FIELD_ICON_GAP = 10;
const ICON_BUTTON_SIZE = 44;

function formatParticipantStatus(status?: string) {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "tentative":
      return "Tentative";
    default:
      return "Invited";
  }
}

export function EventParticipantList({
  participants,
  onRemove,
}: {
  participants: EventParticipantInput[];
  onRemove: (email: string) => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (participants.length === 0) return null;
  return (
    <View style={styles.list}>
      {participants.map((participant) => {
        const name = participant.displayName || participant.email;
        return (
          <View key={participant.email} style={styles.row}>
            <BlobatarAvatar
              email={participant.email}
              name={participant.displayName}
              size={28}
            />
            <View style={styles.meta}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {participant.role === "organizer"
                  ? "Organizer"
                  : participant.displayName
                    ? participant.email
                    : formatParticipantStatus(participant.status)}
              </Text>
            </View>
            {participant.role !== "organizer" && (
              <Pressable
                style={styles.iconButton}
                onPress={() => onRemove(participant.email)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${name}`}
              >
                <Feather
                  name="x"
                  size={14}
                  color={theme.colors.mutedForeground}
                />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function ParticipantPickerSheet({
  visible,
  onClose,
  participants,
  onInvite,
  onRemove,
  error,
  onClearError,
  bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  participants: EventParticipantInput[];
  /** Returns false when the address was rejected; the reason is passed back through `error`. */
  onInvite: (email: string, displayName?: string) => boolean;
  onRemove: (email: string) => void;
  error?: string;
  onClearError: () => void;
  bottomInset: number;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [draft, setDraft] = useState("");

  const close = useCallback(() => {
    setDraft("");
    onClearError();
    onClose();
  }, [onClearError, onClose]);

  const invite = useCallback(
    (email: string, displayName?: string) => {
      const added = onInvite(email, displayName);
      if (added) setDraft("");
      return added;
    },
    [onInvite],
  );

  const handleSelectSuggestion = useCallback(
    (entry: RecentContactEntry) => {
      invite(entry.email, entry.displayName?.trim() || undefined);
    },
    [invite],
  );

  // A typed but unsubmitted address is invited on Done so it isn't silently dropped.
  const handleDone = useCallback(() => {
    if (draft.trim() && !invite(draft)) return;
    close();
  }, [close, draft, invite]);

  const showHelp = useCallback(() => {
    Keyboard.dismiss();
    Alert.alert("Participants", PARTICIPANTS_INVITE_HELP_TEXT);
  }, []);

  return (
    <PickerSheet
      visible={visible}
      onClose={close}
      title="Participants"
      theme={theme}
      bottomInset={bottomInset}
      maxHeightRatio={0.85}
      avoidKeyboard
    >
      <View style={styles.body}>
        <View>
          <RecipientSuggestInput
            mode="calendar"
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              if (error) onClearError();
            }}
            onSelectSuggestion={handleSelectSuggestion}
            onSubmitEditing={() => invite(draft)}
            placeholder="Add participant"
            style={styles.input}
            hasError={Boolean(error)}
            autoFocus
          />
          <View
            style={styles.fieldIcon}
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <Feather
              name="user-plus"
              size={FIELD_ICON_SIZE}
              color={theme.colors.mutedForeground}
            />
          </View>
          <Pressable
            style={[styles.iconButton, styles.infoButton]}
            onPress={showHelp}
            accessibilityRole="button"
            accessibilityLabel="About participant invitations"
          >
            <Feather
              name="info"
              size={16}
              color={theme.colors.mutedForeground}
            />
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ScrollView
          style={styles.listScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <EventParticipantList participants={participants} onRemove={onRemove} />
        </ScrollView>

        <SheetActions chrome={false}>
          <SheetPrimaryButton label="Done" onPress={handleDone} />
        </SheetActions>
      </View>
    </PickerSheet>
  );
}

function createStyles(theme: ThemeTokens) {
  const fieldInset = theme.spacing["3"];

  const view = {
    body: {
      flexShrink: 1,
      paddingHorizontal: theme.spacing["4"],
      paddingBottom: theme.spacing["2"],
      gap: theme.spacing["3"],
    },
    fieldIcon: {
      position: "absolute" as const,
      top: 0,
      left: fieldInset,
      height: ICON_BUTTON_SIZE,
      justifyContent: "center" as const,
    },
    infoButton: {
      position: "absolute" as const,
      top: 0,
      right: 0,
    },
    iconButton: {
      width: ICON_BUTTON_SIZE,
      height: ICON_BUTTON_SIZE,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.md,
    },
    listScroll: {
      flexGrow: 0,
      flexShrink: 1,
    },
    list: {
      gap: 2,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingLeft: 6,
      borderRadius: theme.borderRadius.md,
    },
    meta: {
      flex: 1,
      minWidth: 0,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    input: {
      ...createEditorFieldStyle(theme),
      height: ICON_BUTTON_SIZE,
      paddingVertical: 0,
      paddingLeft: fieldInset + FIELD_ICON_SIZE + FIELD_ICON_GAP,
      paddingRight: ICON_BUTTON_SIZE,
      // iOS draws single-line TextInput text low when lineHeight is set, so drop the inherited one.
      lineHeight: undefined,
    },
    name: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    subtitle: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
    error: {
      marginTop: -theme.spacing["2"],
      paddingHorizontal: 4,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
