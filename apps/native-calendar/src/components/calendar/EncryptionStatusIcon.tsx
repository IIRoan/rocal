import { Feather } from "@expo/vector-icons";

export function EncryptionStatusIcon({
  encrypted,
  color,
  size = 10,
}: {
  encrypted: boolean;
  color: string;
  size?: number;
}) {
  if (!encrypted) {
    return null;
  }

  return (
    <Feather
      name="shield"
      size={size}
      color={color}
      accessibilityLabel="Encrypted event"
    />
  );
}
