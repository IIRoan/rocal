import { Feather } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet } from "react-native";
import {
  getCalendarEncryptionNotice,
  type EncryptableCalendarItem,
} from "@workspace/calendar-core";

export function EncryptionStatusIcon({
  item,
  color,
  size = 10,
}: {
  item: EncryptableCalendarItem;
  color: string;
  size?: number;
}) {
  const meta = getCalendarEncryptionNotice(item);
  const icon =
    meta.state === "encrypted"
      ? "shield"
      : meta.state === "pending"
        ? "alert-triangle"
        : "unlock";
  const explanation = [
    meta.description,
    `Server can read: ${meta.visibleFields.join("; ")}.`,
    meta.originWarning,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <Pressable
      style={styles.button}
      onPress={() => Alert.alert(meta.label, explanation)}
      accessibilityRole="button"
      accessibilityLabel={meta.label}
    >
      <Feather name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
