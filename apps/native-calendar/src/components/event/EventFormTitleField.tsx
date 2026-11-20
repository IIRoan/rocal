import { useRef } from "react";
import { Pressable, Text, TextInput, View, type TextInputInstance } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { FieldError } from "./FieldError";
import type { EventFormStyles } from "./event-form-styles";

export function EventFormTitleField({
  title,
  error,
  styles,
  suggestionLabel,
  onChange,
  onApplySuggestion,
  onFieldFocus,
}: {
  title: string;
  error?: string;
  styles: EventFormStyles;
  /** The date and time read from the title, offered but never applied on its own. */
  suggestionLabel?: string | null;
  onChange: (title: string) => void;
  onApplySuggestion?: () => void;
  onFieldFocus: (input: TextInputInstance | null) => void;
}) {
  const { theme } = useTheme();
  const inputRef = useRef<TextInputInstance>(null);
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
      {suggestionLabel && onApplySuggestion ? (
        <Pressable
          style={({ pressed }) => [
            styles.quickAddRow,
            pressed && styles.quickAddRowPressed,
          ]}
          onPress={onApplySuggestion}
          accessibilityRole="button"
          accessibilityLabel={`Use ${suggestionLabel}`}
        >
          <Feather name="clock" size={16} color={theme.colors.primaryBase} />
          <Text style={styles.quickAddText} numberOfLines={1}>
            Use {suggestionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
