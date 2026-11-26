/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  type ComposeSignatureOption,
  type MailComposeSettings,
} from "@workspace/calendar-core";
import type { ComposeRequest } from "../../lib/mail/compose-request";
import { ComposeSheet } from "./ComposeSheet";

type BodyUpdate = { type: "editBody"; update: (body: string) => string };
type SheetProps = {
  options: ComposeSignatureOption[];
  noneSelected: boolean;
  onSelect: (choice: string | null | undefined) => void;
};

const mockDispatch = jest.fn();
const mockPick = jest.fn();
let mockSettings: MailComposeSettings = DEFAULT_MAIL_COMPOSE_SETTINGS;
let mockBody = "";
let mockSheet: SheetProps | null = null;
let mockSelectIdentity: ((id: string) => void) | null = null;
let mockSeedSignature: unknown = undefined;
const mockIdentities = [
  { id: "id-1", email: "alex@solace.test", name: "Alex", textSignature: "Server signature" },
  { id: "id-2", email: "alias@solace.test", name: "Alias", textSignature: null },
];

jest.mock("react-native", () => ({ ActivityIndicator: () => null, Text: () => null, TextInput: () => null, View: ({ children }: { children?: React.ReactNode }) => <>{children}</>, StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }));
jest.mock("@workspace/native-core/components/BottomSheet", () => ({ BottomSheet: ({ children }: { children: React.ReactNode }) => <>{children}</>, BottomSheetHeader: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({ useTheme: () => ({ theme: jest.requireActual<typeof import("@workspace/design-tokens")>("@workspace/design-tokens").nativeMailLightTheme }) }));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({ useMailSkin: () => ({ body: { fontSize: 14 }, meta: {}, borderTertiary: "synthetic", textTertiary: "synthetic" }) }));
jest.mock("@workspace/native-core/hooks/use-keyboard-inset", () => ({ useKeyboardInset: () => 0 }));
jest.mock("../../lib/mail/use-mail", () => ({ useMailAccount: () => ({ data: { provisioned: true } }), useMailRuntime: () => ({ data: undefined, isLoading: false }), useMailMessage: () => ({ data: null }) }));
jest.mock("../../hooks/use-mail-settings", () => ({ useMailComposeSettings: () => ({ settings: mockSettings, isLoaded: true }) }));
jest.mock("../../hooks/use-compose-identity", () => ({ useComposeIdentity: () => ({ identities: mockIdentities, selectedIdentity: mockIdentities[0], selectedIdentityId: "id-1", composeContext: null, pickerOpen: false, setPickerOpen: jest.fn(), pick: mockPick }) }));
jest.mock("../../hooks/use-compose-form", () => ({ useComposeForm: (input: { signature: unknown }) => { mockSeedSignature = input.signature; return [{ ...jest.requireActual<typeof import("../../lib/mail/compose-form")>("../../lib/mail/compose-form").INITIAL_COMPOSE_FORM, body: mockBody }, mockDispatch]; } }));
jest.mock("../../hooks/use-compose-draft-autosave", () => ({ useComposeDraftAutosave: () => ({ saveDraft: jest.fn(), settleDraftSave: jest.fn() }) }));
jest.mock("../../hooks/use-compose-schedule", () => ({ useComposeSchedule: () => ({ sendAt: null, label: null, open: jest.fn(), clear: jest.fn(), sheet: { key: 0, visible: false, onSchedule: jest.fn(), onDismiss: jest.fn() } }) }));
jest.mock("../../hooks/use-compose-send", () => ({ useComposeSend: () => ({ send: jest.fn(), sending: false, canSend: true }) }));
jest.mock("../../hooks/use-compose-leave", () => ({ useComposeLeave: () => ({ cancel: jest.fn(), dismiss: jest.fn() }) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({ EncodingType: { Base64: "base64" } }));
jest.mock("../../lib/mail/strip-image-metadata", () => ({ stripPickedImageMetadata: jest.fn() }));
jest.mock("./ComposeRecipientFields", () => ({ ComposeRecipientFields: () => null }));
jest.mock("./ComposeBodyEditor", () => ({ ComposeBodyEditor: () => null }));
jest.mock("./ComposeHeader", () => ({ ComposeHeader: () => null }));
jest.mock("./ComposeFormatBar", () => ({ ComposeFormatBar: () => null }));
jest.mock("./ComposeAttachmentList", () => ({ ComposeAttachmentList: () => null }));
jest.mock("./ComposeIdentitySheet", () => ({ ComposeIdentitySheet: ({ onSelect }: { onSelect: (id: string) => void }) => { mockSelectIdentity = onSelect; return null; } }));
jest.mock("./ComposeScheduleSheet", () => ({ ComposeScheduleSheet: () => null }));
jest.mock("./ComposeTemplatesSheet", () => ({ ComposeTemplatesSheet: () => null }));
jest.mock("./ComposeSignatureSheet", () => ({ ComposeSignatureSheet: (props: SheetProps) => { mockSheet = props; return null; } }));

const sealedSettings: MailComposeSettings = {
  ...DEFAULT_MAIL_COMPOSE_SETTINGS,
  signatures: [
    { id: "s-work", name: "Work", body: "Alex Doe\nSolace" },
    { id: "s-short", name: "Short", body: "Alex" },
  ],
  signatureDefaults: [
    { identityId: "id-1", newMessage: "s-work", replyForward: "s-short" },
    { identityId: "id-2", newMessage: "s-short", replyForward: null },
  ],
};

async function renderSheet(request: ComposeRequest) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<ComposeSheet visible request={request} presentKey={1} onClose={() => {}} onCloseComplete={() => {}} onRestore={() => {}} />));
  return root;
}

function lastBodyUpdate(): BodyUpdate["update"] {
  const action = mockDispatch.mock.calls.map(([call]) => call as BodyUpdate).filter((call) => call.type === "editBody").pop();
  if (!action) throw new Error("No body edit dispatched");
  return action.update;
}

beforeEach(() => {
  mockDispatch.mockClear();
  mockPick.mockClear();
  mockSettings = sealedSettings;
  mockBody = "";
});

it("opens a new message with the sender's sealed new-message default, not the server signature", async () => {
  const root = await renderSheet({});
  expect(mockSeedSignature).toEqual({ id: "s-work", textSignature: "Alex Doe\nSolace" });
  expect(mockSheet?.options.map((option) => [option.name, option.selected])).toEqual([["Work", true], ["Short", false]]);
  await act(async () => root.unmount());
});

it("inserts a picked signature once and swaps it for another without touching typed text", async () => {
  const root = await renderSheet({});
  await act(async () => mockSheet?.onSelect("s-short"));
  const inserted = lastBodyUpdate()("Hello");
  expect(inserted).toBe("Hello\n\n-- \nAlex");
  expect(lastBodyUpdate()(inserted)).toBe(inserted);
  mockBody = inserted;
  await act(async () => mockSheet?.onSelect("s-work"));
  expect(lastBodyUpdate()(inserted)).toBe("Hello\n\n-- \nAlex Doe\nSolace");
  await act(async () => mockSheet?.onSelect(null));
  expect(lastBodyUpdate()("Hello\n\n-- \nAlex Doe\nSolace")).toBe("Hello\n\n");
  expect(lastBodyUpdate()("Hello")).toBe("Hello");
  expect(mockSheet?.noneSelected).toBe(true);
  await act(async () => root.unmount());
});

it("swaps an unchanged signature for the new sender's default and leaves an edited or deleted one alone", async () => {
  const root = await renderSheet({});
  await act(async () => mockSelectIdentity?.("id-2"));
  expect(lastBodyUpdate()("Hi\n\n-- \nAlex Doe\nSolace")).toBe("Hi\n\n-- \nAlex");
  expect(lastBodyUpdate()("Hi\n\n-- \nAlex Doe\nSolace Inc")).toBe("Hi\n\n-- \nAlex Doe\nSolace Inc");
  expect(lastBodyUpdate()("Hi, Alex Doe")).toBe("Hi, Alex Doe");
  expect(mockPick).toHaveBeenCalledWith("id-2");
  await act(async () => root.unmount());
});

it("adds a picked reply signature above or below the quote, as the signature position says", async () => {
  const reply = "Thanks\n\nOn Monday, Sam wrote:\n> Hello";
  mockSettings = { ...sealedSettings, replySignaturePosition: "above_quote" };
  const root = await renderSheet({ mode: "reply", messageId: "m1" });
  await act(async () => mockSheet?.onSelect(undefined));
  expect(lastBodyUpdate()(reply)).toBe("Thanks\n\n-- \nAlex\n\nOn Monday, Sam wrote:\n> Hello");
  mockSettings = { ...sealedSettings, replySignaturePosition: "below_quote" };
  await act(async () => root.render(<ComposeSheet visible request={{ mode: "reply", messageId: "m1" }} presentKey={1} onClose={() => {}} onCloseComplete={() => {}} onRestore={() => {}} />));
  await act(async () => mockSheet?.onSelect(undefined));
  expect(lastBodyUpdate()(reply)).toBe(`${reply}\n\n-- \nAlex`);
  await act(async () => root.unmount());
});

it("keeps the server signature until a signature is saved", async () => {
  mockSettings = DEFAULT_MAIL_COMPOSE_SETTINGS;
  const root = await renderSheet({});
  expect(mockSheet?.options).toEqual([
    { key: "account", choice: undefined, name: "Account signature", preview: "Server signature", selected: true },
  ]);
  await act(async () => mockSheet?.onSelect(undefined));
  expect(lastBodyUpdate()("Hi")).toBe("Hi\n\n-- \nServer signature");
  await act(async () => root.unmount());
});
