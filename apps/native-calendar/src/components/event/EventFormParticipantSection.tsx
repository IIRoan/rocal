import { View } from "react-native";
import type { EventParticipantInput } from "@workspace/calendar-core";
import { EventEditorFieldButton } from "./EventEditorPrimitives";
import { EventParticipantList } from "./ParticipantPickerSheet";
import { FieldError } from "./FieldError";
import type { EventFormStyles } from "./event-form-styles";

export function EventFormParticipantSection({
  participants,
  error,
  styles,
  onAdd,
  onRemove,
}: {
  participants: EventParticipantInput[];
  error?: string;
  styles: EventFormStyles;
  onAdd: () => void;
  onRemove: (email: string) => void;
}) {
  return (
    <View style={styles.participantSection}>
      <EventEditorFieldButton
        icon="user-plus"
        label="Add participant"
        muted
        onPress={onAdd}
      />
      <FieldError message={error} style={styles.fieldError} />
      <EventParticipantList participants={participants} onRemove={onRemove} />
    </View>
  );
}
