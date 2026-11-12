/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { clearMailSendAttempts, getMailSendAttemptStore, getCurrentMailComposeDraftId, isMailSendScopeOpen, sendJmapMessage } from "@workspace/calendar-core";
import { ComposeSheet } from "./ComposeSheet";

let mockScope = "";
let mockOnSent: (() => void) | null = null;
jest.mock("react-native", () => ({ ActivityIndicator: () => null, Text: () => null, TextInput: () => null, View: () => null, StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }));
jest.mock("@workspace/native-core/components/BottomSheet", () => ({ BottomSheet: () => null, BottomSheetHeader: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({ useTheme: () => ({ theme: jest.requireActual<typeof import("@workspace/design-tokens")>("@workspace/design-tokens").nativeMailLightTheme }) }));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({ useMailSkin: () => ({ body: { fontSize: 14 }, meta: {}, borderTertiary: "synthetic", textTertiary: "synthetic" }) }));
jest.mock("@workspace/native-core/hooks/use-keyboard-inset", () => ({ useKeyboardInset: () => 0 }));
jest.mock("../../lib/mail/use-mail", () => ({ useMailAccount: () => ({ data: { provisioned: true } }), useMailRuntime: () => ({ data: undefined, isLoading: false }), useMailMessage: () => ({ data: null }) }));
jest.mock("../../hooks/use-mail-settings", () => ({ useMailComposeSettings: () => ({ settings: jest.requireActual<typeof import("@workspace/calendar-core")>("@workspace/calendar-core").DEFAULT_MAIL_COMPOSE_SETTINGS, isLoaded: true }) }));
jest.mock("../../hooks/use-compose-identity", () => ({ useComposeIdentity: () => ({ identities: [], selectedIdentity: null, selectedIdentityId: null, composeContext: null, pickerOpen: false, setPickerOpen: jest.fn(), pick: jest.fn() }) }));
jest.mock("../../hooks/use-compose-form", () => ({ useComposeForm: () => [jest.requireActual<typeof import("../../lib/mail/compose-form")>("../../lib/mail/compose-form").INITIAL_COMPOSE_FORM, jest.fn()] }));
jest.mock("../../hooks/use-compose-draft-autosave", () => ({ useComposeDraftAutosave: () => ({ saveDraft: jest.fn(), settleDraftSave: jest.fn() }) }));
jest.mock("../../hooks/use-compose-send", () => ({ useComposeSend: (input: { sendScope: string; onSent: () => void }) => { mockScope = input.sendScope; mockOnSent = input.onSent; return { send: jest.fn(), sending: false, canSend: true }; } }));
jest.mock("../../hooks/use-compose-leave", () => ({ useComposeLeave: () => ({ cancel: jest.fn(), dismiss: jest.fn() }) }));
jest.mock("expo-document-picker", () => ({}));
jest.mock("expo-file-system/legacy", () => ({}));
jest.mock("./ComposeRecipientFields", () => ({ ComposeRecipientFields: () => null }));
jest.mock("./ComposeBodyEditor", () => ({ ComposeBodyEditor: () => null }));
jest.mock("./ComposeHeader", () => ({ ComposeHeader: () => null }));
jest.mock("./ComposeFormatBar", () => ({ ComposeFormatBar: () => null }));
jest.mock("./ComposeAttachmentList", () => ({ ComposeAttachmentList: () => null }));
jest.mock("./ComposeIdentitySheet", () => ({ ComposeIdentitySheet: () => null }));

it("preserves the actual ComposeSheet scope during StrictMode replay and retires it on unmount", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearMailSendAttempts();
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<React.StrictMode><ComposeSheet visible request={{}} presentKey={1} onClose={() => {}} onCloseComplete={() => {}} /></React.StrictMode>));
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
  await act(async () => root.render(<ComposeSheet visible request={{}} presentKey={1} onClose={onClose} onCloseComplete={() => {}} />));
  const oldScope = mockScope;
  const oldSent = mockOnSent;
  await act(async () => root.render(<ComposeSheet visible request={{ to: "other@solace.test" }} presentKey={2} onClose={onClose} onCloseComplete={() => {}} />));
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
  await act(async () => root.render(<ComposeSheet visible request={{ mode: "draft", messageId: "pending-source" }} presentKey={1} onClose={() => {}} onCloseComplete={() => {}} />));
  expect(getCurrentMailComposeDraftId()).toBe("pending-source");
  await act(async () => root.render(<ComposeSheet visible request={{ mode: "draft", messageId: "replacement-source" }} presentKey={2} onClose={() => {}} onCloseComplete={() => {}} />));
  expect(getCurrentMailComposeDraftId()).toBe("replacement-source");
  await act(async () => root.unmount());
  expect(getCurrentMailComposeDraftId()).toBeNull();
});
