import { useRef } from "react";
import { TextInput, View } from "react-native";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { FieldError } from "./FieldError";
import type { EventFormStyles } from "./event-form-styles";

export function EventFormTitleField({
  title,
  error,
  styles,
  onChange,
  onFieldFocus,
}: {
  title: string;
  error?: string;
  styles: EventFormStyles;
  onChange: (title: string) => void;
  onFieldFocus: (input: TextInput | null) => void;
}) {
  const { theme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  return (
    <View>
      <TextInput
        ref={inputRef}
        style={styles.titleInput}
        value={title}
        onChangeText={onChange}
        placeholder="Title"
        placeholderTextColor={theme.colors.mutedForeground}
        maxLength={255}
        returnKeyType="done"
        blurOnSubmit
        onFocus={() => onFieldFocus(inputRef.current)}
        accessibilityLabel="Event title"
      />
      <FieldError message={error} style={styles.fieldError} />
    </View>
  );
}
