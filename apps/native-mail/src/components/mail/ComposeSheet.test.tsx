/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { clearMailSendAttempts, getMailSendAttemptStore, getCurrentMailComposeDraftId, isMailSendScopeOpen, sendJmapMessage } from "@workspace/calendar-core";
import { ComposeSheet } from "./ComposeSheet";

let mockScope = "";
let mockOnAttach: (() => void) | null = null;
const mockDispatch = jest.fn();
const mockDeleteAsync = jest.fn(async (_uri: string) => undefined);
const mockStrip = jest.fn(async (_uri: string, file: { name: string; type?: string; bytes: Uint8Array }) => ({ ...file, name: "clean.jpg", bytes: new Uint8Array([1]) }));
let mockOnSent: (() => void) | null = null;
jest.mock("react-native", () => ({ ActivityIndicator: () => null, Text: () => null, TextInput: () => null, View: ({ children }: { children?: React.ReactNode }) => <>{children}</>, StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 } }));
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: ({ children }: { children?: React.ReactNode }) => <>{children}</> },
  Easing: { bezier: () => () => 0, out: () => () => 0, cubic: () => 0 },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: unknown) => ({ get: () => value, set: () => undefined }),
  withTiming: (value: unknown) => value,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }));
jest.mock("@workspace/native-core/components/BottomSheet", () => ({ BottomSheet: ({ children }: { children: React.ReactNode }) => <>{children}</>, BottomSheetHeader: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({ useTheme: () => ({ theme: jest.requireActual<typeof import("@workspace/design-tokens")>("@workspace/design-tokens").nativeMailLightTheme }) }));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({ useMailSkin: () => ({ body: { fontSize: 14 }, meta: {}, borderTertiary: "synthetic", textTertiary: "synthetic" }) }));
jest.mock("../../hooks/use-compose-keyboard", () => ({ useComposeKeyboard: () => ({ open: false, height: { get: () => 0, set: () => undefined }, settledInset: 0 }) }));
jest.mock("../../lib/mail/use-mail", () => ({ useMailAccount: () => ({ data: { provisioned: true } }), useMailRuntime: () => ({ data: undefined, isLoading: false }), useMailMessage: () => ({ data: null }) }));
jest.mock("../../hooks/use-mail-settings", () => ({ useMailComposeSettings: () => ({ settings: jest.requireActual<typeof import("@workspace/calendar-core")>("@workspace/calendar-core").DEFAULT_MAIL_COMPOSE_SETTINGS, isLoaded: true }) }));
jest.mock("../../hooks/use-compose-identity", () => ({ useComposeIdentity: () => ({ identities: [], selectedIdentity: null, selectedIdentityId: null, composeContext: null, pickerOpen: false, setPickerOpen: jest.fn(), pick: jest.fn() }) }));
jest.mock("../../hooks/use-compose-form", () => ({ useComposeForm: () => [jest.requireActual<typeof import("../../lib/mail/compose-form")>("../../lib/mail/compose-form").INITIAL_COMPOSE_FORM, mockDispatch] }));
jest.mock("../../hooks/use-compose-draft-autosave", () => ({ useComposeDraftAutosave: () => ({ saveDraft: jest.fn(), settleDraftSave: jest.fn() }) }));
jest.mock("../../hooks/use-compose-schedule", () => ({ useComposeSchedule: () => ({ sendAt: null, label: null, open: jest.fn(), clear: jest.fn(), sheet: { key: 0, visible: false, onSchedule: jest.fn(), onDismiss: jest.fn() } }) }));
jest.mock("../../hooks/use-compose-send", () => ({ useComposeSend: (input: { sendScope: string; onSent: () => void }) => { mockScope = input.sendScope; mockOnSent = input.onSent; return { send: jest.fn(), sending: false, canSend: true }; } }));
jest.mock("../../hooks/use-compose-leave", () => ({ useComposeLeave: () => ({ cancel: jest.fn(), dismiss: jest.fn() }) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: "file:///cache/trip.jpg", name: "trip.jpg", mimeType: "image/jpeg", size: 4 }] }) }));
jest.mock("expo-file-system/legacy", () => ({ EncodingType: { Base64: "base64" }, readAsStringAsync: async () => "/9j/4Q==", deleteAsync: (uri: string) => mockDeleteAsync(uri) }));
jest.mock("../../lib/mail/strip-image-metadata", () => ({ stripPickedImageMetadata: (uri: string, file: { name: string; type?: string; bytes: Uint8Array }) => mockStrip(uri, file) }));
jest.mock("./ComposeFields", () => ({ ComposeFields: () => null }));
jest.mock("./ComposeBodyEditor", () => ({ ComposeBodyEditor: () => null }));
jest.mock("./ComposeHeader", () => ({ ComposeHeader: () => null }));
jest.mock("./ComposeFormatBar", () => ({ ComposeFormatBar: ({ onAttach }: { onAttach: () => void }) => { mockOnAttach = onAttach; return null; } }));
jest.mock("./ComposeIdentitySheet", () => ({ ComposeIdentitySheet: () => null }));
jest.mock("./ComposeScheduleSheet", () => ({ ComposeScheduleSheet: () => null }));
jest.mock("./ComposeTemplatesSheet", () => ({ ComposeTemplatesSheet: () => null }));
jest.mock("./ComposeLinkSheet", () => ({ ComposeLinkSheet: () => null }));
jest.mock("./ComposeSignatureSheet", () => ({ ComposeSignatureSheet: () => null }));

it("preserves the actual ComposeSheet scope during StrictMode replay and retires it on unmount", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearMailSendAttempts();
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<React.StrictMode><ComposeSheet visible request={{}} presentKey={1} onClose={() => {}} onCloseComplete={() => {}} onRestore={() => {}} /></React.StrictMode>));
  expect(mockScope).toMatch(/^compose:/);
  const attempt = getMailSendAttemptStore("strict-native-sheet").get(mockScope, "owner@solace.test");
  expect(attempt.cancelled).toBe(false);
  await expect(sendJmapMessage({ draftsMailboxId: "drafts", fromEmail: "owner@solace.test", to: ["other@solace.test"], subject: "StrictMode first send", textBody: "Body", identityId: "identity", sentCopyCiphertext: null, isCurrent: () => isMailSendScopeOpen(mockScope) }, { attempt, mailAccountId: "strict-native-sheet", submissionAccountId: "strict-native-sheet", policy: null, onCleanupError: () => {}, request: async () => ({ methodResponses: [["Email/set", { created: { draft1: { id: "sent" } } }, "c1"], ["EmailSubmission/set", { created: { s1: { id: "receipt" } } }, "c2"]] }) })).resolves.toMatchObject({ submissionId: "receipt" });
  await act(async () => root.unmount());
  expect(attempt.retired).toBe(true);
  expect(() => getMailSendAttemptStore("strict-native-sheet").get(mockScope, "owner@solace.test")).toThrow("finished");
});


it("ignores an old onSent callback after a replacement ComposeSheet mounts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearMailSendAttempts();
  const root = createRoot(document.createElement("div"));
  const onClose = jest.fn();
  await act(async () => root.render(<ComposeSheet visible request={{}} presentKey={1} onClose={onClose} onCloseComplete={() => {}} onRestore={() => {}} />));
  const oldScope = mockScope;
  const oldSent = mockOnSent;
  await act(async () => root.render(<ComposeSheet visible request={{ to: "other@solace.test" }} presentKey={2} onClose={onClose} onCloseComplete={() => {}} onRestore={() => {}} />));
  const replacement = mockScope;
  expect(replacement).not.toBe(oldScope);
  await act(async () => { oldSent?.(); });
  expect(onClose).not.toHaveBeenCalled();
  expect(mockScope).toBe(replacement);
  expect(isMailSendScopeOpen(replacement)).toBe(true);
  await act(async () => root.unmount());
});


it("protects the requested draft while native restoration has not seeded the form ID", async () => {
  clearMailSendAttempts();
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<ComposeSheet visible request={{ mode: "draft", messageId: "pending-source" }} presentKey={1} onClose={() => {}} onCloseComplete={() => {}} onRestore={() => {}} />));
  expect(getCurrentMailComposeDraftId()).toBe("pending-source");
  await act(async () => root.render(<ComposeSheet visible request={{ mode: "draft", messageId: "replacement-source" }} presentKey={2} onClose={() => {}} onCloseComplete={() => {}} onRestore={() => {}} />));
  expect(getCurrentMailComposeDraftId()).toBe("replacement-source");
  await act(async () => root.unmount());
  expect(getCurrentMailComposeDraftId()).toBeNull();
});

it("attaches a picked photo only after removing its metadata, then deletes the picker copy", async () => {
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<ComposeSheet visible request={{}} presentKey={1} onClose={() => {}} onCloseComplete={() => {}} onRestore={() => {}} />));
  await act(async () => { mockOnAttach?.(); });
  expect(mockStrip).toHaveBeenCalledWith("file:///cache/trip.jpg", { name: "trip.jpg", type: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe1]) });
  expect(mockDispatch).toHaveBeenCalledWith({ type: "attach", attachment: expect.objectContaining({ name: "clean.jpg", type: "image/jpeg" }) });
  expect(mockDeleteAsync).toHaveBeenCalledWith("file:///cache/trip.jpg");
  await act(async () => root.unmount());
});
