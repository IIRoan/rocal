import { Text, type TextStyle } from "react-native";

export function FieldError({
  message,
  style,
}: {
  message?: string;
  style: TextStyle;
}) {
  return message ? <Text style={style}>{message}</Text> : null;
}
