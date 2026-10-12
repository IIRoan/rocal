import { useRef } from "react";
import { TextInput, View } from "react-native";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { EventEditorField } from "./EventEditorPrimitives";
import { FieldError } from "./FieldError";
import type { EventFormStyles } from "./event-form-styles";

export function EventFormNotesFields({
  location,
  description,
  locationError,
  descriptionError,
  styles,
  onChangeLocation,
  onChangeDescription,
  onFieldFocus,
}: {
  location: string;
  description: string;
  locationError?: string;
  descriptionError?: string;
  styles: EventFormStyles;
  onChangeLocation: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onFieldFocus: (input: TextInput | null) => void;
}) {
  const { theme } = useTheme();
  const locationInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  return (
    <>
      <View>
        <EventEditorField icon="map-pin">
          <TextInput
            ref={locationInputRef}
            style={styles.input}
            value={location}
            onChangeText={onChangeLocation}
            placeholder="Location"
            placeholderTextColor={theme.colors.mutedForeground}
            maxLength={255}
            returnKeyType="done"
            blurOnSubmit
            onFocus={() => onFieldFocus(locationInputRef.current)}
            accessibilityLabel="Location"
          />
        </EventEditorField>
        <FieldError message={locationError} style={styles.fieldError} />
      </View>

      <View>
        <EventEditorField icon="edit-2" multiline>
          <TextInput
            ref={descriptionInputRef}
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={onChangeDescription}
            placeholder="Description"
            placeholderTextColor={theme.colors.mutedForeground}
            maxLength={1000}
            multiline
            textAlignVertical="top"
            onFocus={() => onFieldFocus(descriptionInputRef.current)}
            accessibilityLabel="Description"
          />
        </EventEditorField>
        <FieldError message={descriptionError} style={styles.fieldError} />
      </View>
    </>
  );
}
