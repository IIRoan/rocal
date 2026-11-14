/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Alert, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useMailLinkPress } from "./use-mail-link-press";

const mockOpenCompose = jest.fn();
const mockToast = jest.fn();
let mockConfirmExternalLinks = true;

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
}));
jest.mock("./use-mail-settings", () => ({
  useMailDisplaySettings: () => ({ settings: { confirmExternalLinks: mockConfirmExternalLinks } }),
}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock("@workspace/native-core/providers/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock("../providers/MailComposeProvider", () => ({
  useMailCompose: () => ({ openCompose: mockOpenCompose }),
}));

type Press = ReturnType<typeof useMailLinkPress>;

function Probe({ onReady }: { onReady: (press: Press) => void }) {
  const press = useMailLinkPress();
  useEffect(() => onReady(press));
  return null;
}

describe("useMailLinkPress", () => {
  let root: Root;
  let press: Press = () => {
    throw new Error("Hook was not mounted");
  };

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    mockConfirmExternalLinks = true;
    root = createRoot(document.createElement("div"));
    await act(async () =>
      root.render(
        <Probe
          onReady={(next) => {
            press = next;
          }}
        />,
      ),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("opens compose with the parsed mailto fields", () => {
    press({ href: "mailto:a@example.org?subject=Hi&body=Hello", text: "Write" });
    expect(mockOpenCompose).toHaveBeenCalledWith({
      mailto: { to: ["a@example.org"], cc: [], bcc: [], subject: "Hi", body: "Hello" },
    });
  });

  it("says so when a mailto link cannot be read", () => {
    press({ href: `mailto:a@example.org?body=${"x".repeat(20_000)}`, text: "" });
    expect(mockOpenCompose).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("This email link can't be opened.", "error");
  });

  it("dials tel links and ignores other schemes", () => {
    press({ href: "tel:+31201234567", text: "Call" });
    press({ href: "about:blank#top", text: "Top" });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+31201234567");
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(mockOpenCompose).not.toHaveBeenCalled();
  });

  it("shows the real host before opening a web link and opens it on confirm", () => {
    press({ href: "https://paypal.com.evil.test/login", text: "paypal.com" });
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    const [title, message, buttons] = jest.mocked(Alert.alert).mock.calls[0] ?? [];
    expect(title).toBe("Open this link?");
    expect(message).toBe(
      "Opens paypal.com.evil.test.\n\nThe link text shows paypal.com, but it opens paypal.com.evil.test.\n\nhttps://paypal.com.evil.test/login",
    );
    buttons?.find((button) => button.text === "Open")?.onPress?.();
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://paypal.com.evil.test/login");
  });

  it("opens plain links directly when confirmation is off, but still asks about warned ones", () => {
    mockConfirmExternalLinks = false;
    act(() => root.render(<Probe onReady={(next) => { press = next; }} />));
    press({ href: "https://example.com/", text: "Example" });
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://example.com/");
    expect(Alert.alert).not.toHaveBeenCalled();

    press({ href: "https://xn--pple-43d.com/", text: "" });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1);
  });
});
