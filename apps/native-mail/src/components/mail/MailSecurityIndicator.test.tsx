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

  it.each([false, true])("hides routine mailbox encryption status when enabled=%s", (encryptedAtRest) => {
    act(() =>
      root.render(
        <MailSecurityIndicator
          encryption="plain"
          encryptedAtRest={encryptedAtRest}
          readState="decrypted"
        />,
      ),
    );
    expect(mockPressable).toBeNull();
    expect(mockIconName).toBeNull();
  });

  it.each(["inline_pgp", "pgp_mime", "internal_e2ee"] as const)("hides routine %s status", (encryption) => {
    act(() =>
      root.render(
        <MailSecurityIndicator
          encryption={encryption}
          encryptedAtRest
          readState="decrypted"
        />,
      ),
    );
    expect(mockPressable).toBeNull();
    expect(mockIconName).toBeNull();
  });

  it("keeps decryption failures visible", () => {
    act(() =>
      root.render(
        <MailSecurityIndicator
          encryption="inline_pgp"
          encryptedAtRest
          readState="failed"
        />,
      ),
    );
    expect(mockPressable?.accessibilityLabel).toBe("Decryption failed");
    expect(mockIconName).toBe("alert-triangle");
  });

  it("keeps failed signature warnings visible with mailbox encryption enabled", () => {
    act(() =>
      root.render(
        <MailSecurityIndicator
          encryption="inline_pgp"
          encryptedAtRest
          readState="decrypted"
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
          readState="decrypted"
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
          readState="decrypted"
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

  it.each(["decrypted", "pending"] as const)(
    "hides routine MIME reading status: %s",
    (readState) => {
      act(() =>
        root.render(
          <MailSecurityIndicator
            encryption="pgp_mime"
            encryptedAtRest
            readState={readState}
          />,
        ),
      );
      expect(mockPressable).toBeNull();
      expect(mockIconName).toBeNull();
    },
  );

  it("keeps reading-limit explanations available", () => {
    act(() =>
      root.render(
        <MailSecurityIndicator
          encryption="pgp_mime"
          encryptedAtRest
          readState="read_limit"
        />,
      ),
    );
    expect(mockPressable?.accessibilityLabel).toBe("Reading limit reached");
    expect(mockIconName).toBe("info");
    mockPressable?.onPress();
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Reading limit reached",
      expect.stringContaining(
        "This message exceeds the size or complexity limits for this reader.",
      ),
    );
  });
});
