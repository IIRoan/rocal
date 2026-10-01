import { Alert } from "react-native";
import { EncryptionStatusIcon } from "./EncryptionStatusIcon";

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Pressable: "Pressable",
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));

describe("native event encryption notice", () => {
  it("warns about legacy readable copies when the badge is pressed", () => {
    const badge = EncryptionStatusIcon({
      item: { encryptionState: "shadow_write" },
      color: "muted",
    });
    expect(badge.props.accessibilityLabel).toBe("Encryption pending");
    expect(badge.props.children.props.name).toBe("alert-triangle");
    badge.props.onPress();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Encryption pending",
      expect.stringContaining("readable copy may remain"),
    );
  });

  it("does not claim plaintext is encrypted because its calendar requires encryption", () => {
    const badge = EncryptionStatusIcon({
      item: { encryptionState: "plaintext", forceFullEncryption: true },
      color: "muted",
    });
    expect(badge.props.accessibilityLabel).toBe("Not encrypted");
    expect(badge.props.children.props.name).toBe("unlock");
  });
});
