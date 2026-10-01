import { Alert } from "react-native";
import { MailSecurityIndicator } from "./MailSecurityIndicator";

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Pressable: "Pressable",
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));
jest.mock("@expo/vector-icons", () => ({ Feather: "Feather" }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: { colors: {}, borderRadius: {} } }),
}));

describe("native mail encryption notice", () => {
  it("does not use a mailbox setting as proof that a message is encrypted", () => {
    const badge = MailSecurityIndicator({
      encryption: "plain",
      encryptedAtRest: true,
      decryptionFailed: false,
    });
    badge.props.onPress();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Mailbox encryption enabled",
      expect.stringContaining("does not confirm encryption of this message"),
    );
  });

  it("keeps failed signature warnings visible with mailbox encryption enabled", () => {
    const badge = MailSecurityIndicator({
      encryption: "inline_pgp",
      encryptedAtRest: true,
      decryptionFailed: false,
      signatureVerificationState: "failed",
    });
    expect(badge.props.accessibilityLabel).toBe(
      "PGP encrypted, signature check failed",
    );
    expect(badge.props.children.props.name).toBe("alert-triangle");
  });
});
