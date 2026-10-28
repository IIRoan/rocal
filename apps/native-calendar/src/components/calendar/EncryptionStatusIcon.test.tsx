import { Alert } from "react-native";
import { EncryptionStatusIcon } from "./EncryptionStatusIcon";

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Pressable: "Pressable",
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));

describe("native event encryption notice", () => {
  it("explains encrypted fields when the badge is pressed", () => {
    const badge = EncryptionStatusIcon({
      item: { encryptionState: "encrypted" },
      color: "muted",
    });
    expect(badge.props.accessibilityLabel).toBe("End-to-end encrypted");
    expect(badge.props.children.props.name).toBe("shield");
    badge.props.onPress();
    expect(Alert.alert).toHaveBeenCalledWith(
      "End-to-end encrypted",
      expect.stringContaining("encrypted on your device"),
    );
  });

  it("marks plaintext feed events as not encrypted", () => {
    const badge = EncryptionStatusIcon({
      item: { encryptionState: "plaintext" },
      color: "muted",
    });
    expect(badge.props.accessibilityLabel).toBe("Not encrypted");
    expect(badge.props.children.props.name).toBe("unlock");
  });
});
