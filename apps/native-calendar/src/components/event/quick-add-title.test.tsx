/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { nativeLightTheme } from "@workspace/design-tokens";
import { formatQuickAddSummary, parseQuickAdd } from "@workspace/calendar-core";
import { EventFormTitleField } from "./EventFormTitleField";
import { createEventFormStyles } from "./event-form-styles";
import { toTimezonePickerISOString } from "./event-form-utils";

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TextInput: ({ value }: { value: string }) => <input readOnly value={value} />,
  Pressable: ({
    accessibilityLabel,
    accessibilityRole,
    children,
    onPress,
  }: {
    accessibilityLabel?: string;
    accessibilityRole?: string;
    children: ReactNode;
    onPress: () => void;
  }) => (
    <div role={accessibilityRole} aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </div>
  ),
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({
    theme: jest.requireActual("@workspace/design-tokens").nativeLightTheme,
  }),
}));

const styles = createEventFormStyles(nativeLightTheme);
const timezone = "Europe/Amsterdam";
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

const renderField = (suggestionLabel: string | null, onApply = jest.fn()) => {
  act(() =>
    root.render(
      <EventFormTitleField
        title="Lunch with Ana tomorrow 1pm"
        styles={styles}
        suggestionLabel={suggestionLabel}
        onChange={() => {}}
        onApplySuggestion={onApply}
        onFieldFocus={() => {}}
      />,
    ),
  );
  return onApply;
};

test("offers the parsed date and time as a 44pt button that applies it", () => {
  const result = parseQuickAdd("Lunch with Ana tomorrow 1pm", {
    now: new Date("2026-11-14T10:00:00.000Z"),
    timezone,
    defaultDurationMinutes: 60,
  });
  expect(result).not.toBeNull();
  if (!result) return;
  const onApply = renderField(formatQuickAddSummary(result, timezone, "24h"));

  const row = container.querySelector<HTMLDivElement>('[role="button"]');
  expect(row?.getAttribute("aria-label")).toBe("Use Sun 15 Nov · 13:00–14:00");
  expect(styles.quickAddRow.minHeight).toBe(44);
  act(() => row?.click());
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(toTimezonePickerISOString(result.start, timezone)).toBe("2026-11-15T13:00");
  expect(toTimezonePickerISOString(result.end, timezone)).toBe("2026-11-15T14:00");
});

test("shows no row when the title holds no date or time", () => {
  renderField(null);
  expect(container.querySelector('[role="button"]')).toBeNull();
});
