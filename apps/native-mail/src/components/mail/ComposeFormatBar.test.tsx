/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EMPTY_MAIL_EDITOR_FORMAT_STATE, type MailEditorFormatState } from "@workspace/mail-editor/protocol";
import { ComposeFormatBar } from "./ComposeFormatBar";

jest.mock("react-native", () => ({
  Pressable: ({ children, onPress, onPressIn, accessibilityLabel, accessibilityState }: { children?: ReactNode; onPress?: () => void; onPressIn?: () => void; accessibilityLabel?: string; accessibilityState?: { selected?: boolean; expanded?: boolean } }) => (
    <button type="button" aria-label={accessibilityLabel} aria-pressed={accessibilityState?.selected} aria-expanded={accessibilityState?.expanded} onClick={onPress} onMouseDown={onPressIn}>
      {children}
    </button>
  ),
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children, accessibilityLabel, testID }: { children?: ReactNode; accessibilityLabel?: string; testID?: string }) => (
    <div aria-label={accessibilityLabel} data-testid={testID}>{children}</div>
  ),
}));
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: ({ children, accessibilityElementsHidden }: { children?: ReactNode; accessibilityElementsHidden?: boolean }) => (
      <div data-row={accessibilityElementsHidden === undefined ? undefined : "second"} aria-hidden={accessibilityElementsHidden}>{children}</div>
    ),
  },
  Easing: { out: () => () => 0, cubic: () => 0 },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: unknown) => ({ get: () => value, set: () => undefined }),
  withTiming: (value: unknown) => value,
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: jest.requireActual<typeof import("@workspace/design-tokens")>("@workspace/design-tokens").nativeMailLightTheme }),
}));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({
  MAIL_LAYOUT: { hitSize: 44 },
  useMailSkin: () => ({ body: { fontSize: 14 }, meta: {}, borderTertiary: "synthetic", textTertiary: "synthetic", pressed: "synthetic" }),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  jest.clearAllMocks();
});

afterEach(() => act(() => root.unmount()));

const onFormat = jest.fn();
const onLink = jest.fn();
const onInsertPhoto = jest.fn();
const onChooseSignature = jest.fn();
const onSchedule = jest.fn();
const onAttach = jest.fn();

function render({
  formatState = EMPTY_MAIL_EDITOR_FORMAT_STATE,
  plainTextMode = false,
  active = true,
}: { formatState?: MailEditorFormatState; plainTextMode?: boolean; active?: boolean } = {}) {
  act(() =>
    root.render(
      <ComposeFormatBar
        active={active}
        plainTextMode={plainTextMode}
        formatState={formatState}
        onFormat={onFormat}
        onLink={onLink}
        onInsertPhoto={onInsertPhoto}
        onAttach={onAttach}
        onChooseSignature={onChooseSignature}
        onInsertTemplate={jest.fn()}
        onSchedule={onSchedule}
      />,
    ),
  );
}

const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const secondRow = () => container.querySelector('[data-row="second"]');
const pressIn = (label: string) => act(() => button(label)?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));

it("formats on press-in, shows what is active under the caret and opens the link and photo pickers", () => {
  render({ formatState: { ...EMPTY_MAIL_EDITOR_FORMAT_STATE, bold: true, link: "https://solace.onl" } });
  expect(button("Bold")?.getAttribute("aria-pressed")).toBe("true");
  expect(button("Italic")?.getAttribute("aria-pressed")).toBe("false");
  expect(button("Edit link")?.getAttribute("aria-pressed")).toBe("true");

  for (const [label, format] of [["Italic", "italic"], ["Underline", "underline"], ["Bulleted list", "bulletList"]] as const) {
    pressIn(label);
    expect(onFormat).toHaveBeenLastCalledWith(format);
  }
  act(() => button("Edit link")?.click());
  act(() => button("Insert photo")?.click());
  act(() => button("Attach file")?.click());
  expect(onLink).toHaveBeenCalledTimes(1);
  expect(onInsertPhoto).toHaveBeenCalledTimes(1);
  expect(onAttach).toHaveBeenCalledTimes(1);
});

it("grows a second row from More, and folds it back when a picker opens", () => {
  render({ formatState: { ...EMPTY_MAIL_EDITOR_FORMAT_STATE, orderedList: true } });
  expect(secondRow()?.getAttribute("aria-hidden")).toBe("true");
  act(() => button("More tools")?.click());
  expect(secondRow()?.getAttribute("aria-hidden")).toBe("false");
  expect(button("Fewer tools")?.getAttribute("aria-expanded")).toBe("true");
  expect(button("Numbered list")?.getAttribute("aria-pressed")).toBe("true");

  for (const [label, format] of [["Strikethrough", "strike"], ["Quote", "blockquote"], ["Clear formatting", "clearFormatting"]] as const) {
    pressIn(label);
    expect(onFormat).toHaveBeenLastCalledWith(format);
  }
  expect(secondRow()?.getAttribute("aria-hidden")).toBe("false");

  act(() => button("Signature")?.click());
  expect(onChooseSignature).toHaveBeenCalledTimes(1);
  expect(secondRow()?.getAttribute("aria-hidden")).toBe("true");

  act(() => button("More tools")?.click());
  act(() => button("Schedule send")?.click());
  expect(onSchedule).toHaveBeenCalledTimes(1);
  expect(secondRow()?.getAttribute("aria-hidden")).toBe("true");
});

it("folds back to one row when it leaves the screen", () => {
  render();
  act(() => button("More tools")?.click());
  render({ active: false });
  render();
  expect(secondRow()?.getAttribute("aria-hidden")).toBe("true");
});

it("keeps only attach, signature, template and schedule in plain-text compose", () => {
  render({ plainTextMode: true });
  expect(Array.from(container.querySelectorAll("button"), (element) => element.getAttribute("aria-label"))).toEqual([
    "Attach file",
    "Signature",
    "Insert template",
    "Schedule send",
  ]);
});
