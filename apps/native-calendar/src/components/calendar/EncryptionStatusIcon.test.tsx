import { Alert } from "react-native";
import { EncryptionStatusIcon } from "./EncryptionStatusIcon";

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Pressable: "Pressable",
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));

describe("native event encryption notice", () => {
  it("hides routine encryption status", () => {
    const badge = EncryptionStatusIcon({
      item: { encryptionState: "encrypted" },
      color: "muted",
    });
    expect(badge).toBeNull();
  });

  it("marks plaintext feed events as not encrypted", () => {
    const badge = EncryptionStatusIcon({
      item: { encryptionState: "plaintext" },
      color: "muted",
    });
    if (!badge) throw new Error("Plaintext event warning missing");
    expect(badge.props.accessibilityLabel).toBe("Not encrypted");
    expect(badge.props.children.props.name).toBe("unlock");
    badge.props.onPress();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Not encrypted",
      expect.stringContaining("Event details are readable to the server."),
    );
  });
});
