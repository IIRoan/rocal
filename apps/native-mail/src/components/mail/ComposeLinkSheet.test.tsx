/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComposeLinkSheet } from "./ComposeLinkSheet";

let mockField: { value: string; onChangeText: (value: string) => void } | null = null;

jest.mock("@workspace/native-core/components/BottomSheet", () => ({
  BottomSheet: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  BottomSheetHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  BottomSheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));
jest.mock("@workspace/native-core/components/sheet/SheetSections", () => ({
  SheetScroll: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetMessage: ({ text }: { text: string }) => <p role="alert">{text}</p>,
  SheetTextField: (props: { value: string; onChangeText: (value: string) => void }) => {
    mockField = props;
    return <input aria-label="Link address" value={props.value} readOnly />;
  },
  SheetButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={disabled}>{label}</button>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const onApply = jest.fn();
const onRemove = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

const button = (label: string) => Array.from(container.querySelectorAll("button")).find((element) => element.textContent === label);

function render(currentLink: string | null) {
  act(() => root.render(<ComposeLinkSheet visible currentLink={currentLink} onApply={onApply} onRemove={onRemove} onDismiss={jest.fn()} />));
}

it("prefills the current link, applies an edited one and removes it", () => {
  render("https://solace.onl");
  expect(container.querySelector("h2")?.textContent).toBe("Edit link");
  expect(mockField?.value).toBe("https://solace.onl");
  act(() => mockField?.onChangeText("solace.onl/docs"));
  act(() => button("Apply")?.click());
  expect(onApply).toHaveBeenCalledWith("https://solace.onl/docs");
  act(() => button("Remove link")?.click());
  expect(onRemove).toHaveBeenCalled();
});

it("refuses a script link and offers no removal without a link", () => {
  render(null);
  expect(container.querySelector("h2")?.textContent).toBe("Add link");
  expect(button("Remove link")).toBeUndefined();
  act(() => mockField?.onChangeText("javascript:alert(1)"));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Use a web, mail or phone link.");
  expect(button("Apply")?.disabled).toBe(true);
});
