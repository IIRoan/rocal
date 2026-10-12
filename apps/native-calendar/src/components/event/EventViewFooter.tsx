import { Pressable, Text, View } from "react-native";
import { BottomSheetFooter } from "@workspace/native-core/components/BottomSheet";
import {
  SheetActions,
  SheetPrimaryButton,
  SheetSecondaryButton,
} from "@workspace/native-core/components/sheet/SheetActions";
import type { EventSheetViewActions } from "./event-sheet-view-actions";
import type { EventSheetStyles } from "./event-sheet-styles";

export type InvitationResponse = "accepted" | "tentative" | "declined";

export function EventViewFooter({
  styles,
  viewActions,
  isPending,
  onRespond,
  onDelete,
  onClose,
  onEdit,
}: {
  styles: EventSheetStyles;
  viewActions: EventSheetViewActions;
  isPending: boolean;
  onRespond: (status: InvitationResponse) => void;
  onDelete: () => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <BottomSheetFooter>
      {viewActions.showInvitationActions ? (
        <View style={styles.rsvpRow}>
          {(
            [
              ["accepted", "Accept"],
              ["tentative", "Maybe"],
              ["declined", "Decline"],
            ] as const
          ).map(([status, label]) => {
            const selected = viewActions.invitationStatus === status;
            return (
              <Pressable
                key={status}
                onPress={() => onRespond(status)}
                disabled={isPending}
                style={({ pressed }) => [
                  styles.rsvpButton,
                  selected && styles.rsvpButtonSelected,
                  pressed && styles.rsvpButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: isPending }}
                accessibilityLabel={label}
              >
                <Text
                  style={[
                    styles.rsvpButtonText,
                    selected && styles.rsvpButtonTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <SheetActions chrome={false}>
        {viewActions.showDelete ? (
          <SheetSecondaryButton
            label={viewActions.deleteLabel}
            variant="destructive"
            onPress={onDelete}
            disabled={isPending}
          />
        ) : null}
        <SheetSecondaryButton label="Close" onPress={onClose} />
        {viewActions.showEdit ? (
          <SheetPrimaryButton
            label="Edit"
            icon="edit-2"
            onPress={onEdit}
            disabled={isPending}
          />
        ) : null}
      </SheetActions>
    </BottomSheetFooter>
  );
}

// BottomSheet slots chrome by direct-child displayName, so this wrapper must claim the footer slot.
EventViewFooter.displayName = "BottomSheetFooter";
