/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useMailLinkPress } from "./use-mail-link-press";

const mockOpenCompose = jest.fn();
const mockToast = jest.fn();

jest.mock("react-native", () => ({
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
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
});
