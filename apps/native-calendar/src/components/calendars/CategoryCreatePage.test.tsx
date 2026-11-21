/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TextInputProps } from "react-native";
import { CategoryCreatePage } from "./CategoryCreatePage";

const mockMutate = jest.fn();
let mockField: TextInputProps | undefined;
let mockCreate: (() => void) | undefined;

jest.mock("../../hooks/use-categories", () => ({
  useCategories: () => ({ data: [] }),
  useCreateCategory: () => ({ mutate: mockMutate, isPending: false }),
}));
jest.mock("../event/ColorPicker", () => ({ ColorPicker: () => null }));
jest.mock("@workspace/native-core/components/sheet/SheetPageStack", () => ({
  useSheetPageNavigator: () => ({ back: jest.fn() }),
}));
jest.mock("@workspace/native-core/components/sheet/SheetSections", () => {
  const Slot = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    SheetScroll: Slot,
    SheetSection: Slot,
    SheetGroup: Slot,
    SheetGroupBlock: Slot,
    SheetMessage: ({ text }: { text: string }) => <div>{text}</div>,
    SheetTextField: (props: TextInputProps) => {
      mockField = props;
      return null;
    },
    SheetButton: ({ onPress }: { onPress: () => void }) => {
      mockCreate = onPress;
      return null;
    },
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;

afterEach(() => {
  act(() => root.unmount());
  mockMutate.mockClear();
});

it("leaves the name field uncontrolled and still creates with what was typed", () => {
  root = createRoot(document.createElement("div"));
  act(() => root.render(<CategoryCreatePage />));

  expect(mockField).toBeDefined();
  expect(mockField).not.toHaveProperty("value");

  act(() => mockField?.onChangeText?.("Travel"));
  act(() => mockCreate?.());

  expect(mockMutate).toHaveBeenCalledWith({ name: "Travel", color: "blue" }, expect.anything());
});
