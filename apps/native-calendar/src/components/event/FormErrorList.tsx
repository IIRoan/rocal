import {
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export function FormErrorList({
  errors,
  styles,
}: {
  errors?: string[];
  styles: { errorContainer: StyleProp<ViewStyle>; errorText: StyleProp<TextStyle> };
}) {
  if (!errors?.length) return null;
  return (
    <View style={styles.errorContainer}>
      {errors.map((error) => (
        <Text key={error} style={styles.errorText}>
          {error}
        </Text>
      ))}
    </View>
  );
}
