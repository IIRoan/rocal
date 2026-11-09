/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from "./ThemeProvider";

let mockSystemScheme = "light";

jest.mock("react-native", () => ({
  useColorScheme: () => mockSystemScheme,
  StatusBar: ({ barStyle }: { barStyle: string }) => (
    <output aria-label="Status bar">{barStyle}</output>
  ),
}));

jest.mock("expo-router", () => ({
  DarkTheme: { dark: true, colors: {} },
  DefaultTheme: { dark: false, colors: {} },
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => "light"),
  setItemAsync: jest.fn(async () => undefined),
}));

function ThemeControls() {
  const { setThemePreference } = useTheme();
  return (
    <>
      <button onClick={() => setThemePreference("light")}>Light</button>
      <button onClick={() => setThemePreference("dark")}>Dark</button>
      <button onClick={() => setThemePreference("system")}>System</button>
    </>
  );
}

test("status-bar text follows the chosen theme and system-theme changes", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = () =>
    root.render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>,
    );
  const style = () => container.querySelector("output")?.textContent;
  const select = async (label: string) => {
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === label,
    );
    if (!button) throw new Error("Theme option is missing");
    await act(async () => button.click());
  };
  try {
    await act(async () => render());
    expect(style()).toBe("dark-content");
    await select("Dark");
    expect(style()).toBe("light-content");
    await select("Light");
    expect(style()).toBe("dark-content");
    mockSystemScheme = "dark";
    await select("System");
    expect(style()).toBe("light-content");
    mockSystemScheme = "light";
    await act(async () => render());
    expect(style()).toBe("dark-content");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
