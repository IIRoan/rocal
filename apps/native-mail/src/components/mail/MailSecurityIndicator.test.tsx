/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Alert } from "react-native";
import { MailSecurityIndicator } from "./MailSecurityIndicator";

type PressableProps = {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
};

jest.mock("@workspace/calendar-core", () => ({
  ...jest.requireActual<typeof import("@workspace/calendar-core")>(
    "@workspace/calendar-core",
  ),
  MAIL_KEY_CONTINUITY_ENABLED: true,
}));

let mockPressable: PressableProps | null = null;
let mockIconName: string | null = null;

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Pressable: (props: PressableProps) => {
    mockPressable = props;
    return props.children;
  },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));
jest.mock("@expo/vector-icons", () => ({
  Feather: ({ name }: { name: string }) => {
    mockIconName = name;
    return null;
  },
}));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: { colors: {}, borderRadius: {} } }),
}));

describe("native mail encryption notice", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    mockPressable = null;
    mockIconName = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("does not use a mailbox setting as proof that a message is encrypted", () => {
    act(() =>
      root.render(
        <MailSecurityIndicator
          encryption="plain"
          encryptedAtRest
          decryptionFailed={false}
        />,
      ),
    );
    mockPressable?.onPress();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Mailbox encryption enabled",
      expect.stringContaining("does not confirm encryption of this message"),
    );
  });

  it("keeps failed signature warnings visible with mailbox encryption enabled", () => {
    act(() =>
      root.render(
        <MailSecurityIndicator
          encryption="inline_pgp"
          encryptedAtRest
          decryptionFailed={false}
          signatureVerificationState="failed"
        />,
      ),
    );
    expect(mockPressable?.accessibilityLabel).toBe(
      "PGP encrypted, signature check failed",
    );
    expect(mockIconName).toBe("alert-triangle");
  });
  it("shows a changed sender key instead of claiming the current directory key is verified", () => {
    act(() =>
      root.render(
        <MailSecurityIndicator
          encryption="inline_pgp"
          encryptedAtRest
          decryptionFailed={false}
          signatureVerificationState="verified"
          senderKeyTrustState={{
            kind: "key_changed",
            oldFingerprint: "A".repeat(40),
            newFingerprint: "B".repeat(40),
          }}
        />,
      ),
    );
    expect(mockIconName).toBe("alert-triangle");
    expect(mockPressable?.accessibilityLabel).toContain("sender key changed");
    mockPressable?.onPress();
    expect(Alert.alert).toHaveBeenCalledWith(
      expect.stringContaining("sender key changed"),
      expect.stringContaining("Signature matches previous saved key"),
    );
  });
  it("offers explicit sender-key review from a changed-key read notice", () => {
    const review = jest.fn();
    act(() =>
      root.render(
        <MailSecurityIndicator
          encryption="inline_pgp"
          encryptedAtRest
          decryptionFailed={false}
          signatureVerificationState="failed"
          senderKeyTrustState={{
            kind: "key_changed",
            oldFingerprint: "A".repeat(40),
            newFingerprint: "B".repeat(40),
          }}
          onReviewSenderKey={review}
        />,
      ),
    );
    jest.mocked(Alert.alert).mockClear();
    mockPressable?.onPress();
    const action = jest
      .mocked(Alert.alert)
      .mock.calls[0]?.[2]?.find((item) => item.text === "Review sender key");
    expect(action).toBeDefined();
    expect(review).not.toHaveBeenCalled();
    action?.onPress?.();
    expect(review).toHaveBeenCalledTimes(1);
  });
});
