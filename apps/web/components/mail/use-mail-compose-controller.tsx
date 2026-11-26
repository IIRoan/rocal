"use client";

import {
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "@workspace/ui/lib/toast";
import {
  createMailSendSessionId,
  createMailSendScopeLifetime,
  discardMailSendAttempt,
  hasComposeUserContent,
  parseMailtoLink,
  composeHtmlToPlainText,
  plainTextToComposeHtml,
  type ComposeTextFields,
  type MailServerLimits,
  type MailtoDraft,
  type QuotedDateOptions,
} from "@workspace/calendar-core";
import type { JmapEmailMessage, JmapIdentity } from "@/lib/mail/types";
import { htmlToPlainText } from "@/lib/mail/signature-utils";
import { readMailComposeSettings } from "@/lib/mail/compose-settings";
import { hasInsertedComposeImage, resetComposeInlineImages } from "@/lib/mail/compose-inline-images";
import { resolveMailLink, takeMailLinkFragment, type MailLink } from "@/lib/mail/mail-link-handoff";
import type { QuotedInlineAttachment } from "@/lib/mail/compose-editor-utils";
import {
  cancelComposeDraftSave,
  composeBridgeRef,
  flushComposeDraftSave,
  getComposeCloseActionsRef,
} from "./mail-compose-bridge";
import {
  buildDraftSeed,
  buildForwardSeed,
  buildMailtoSeed,
  buildNewMessageSeed,
  buildOpenNewComposeSeed,
  buildReplySeed,
} from "./mail-compose-seed";
import {
  initialMailComposeState,
  mailComposeReducer,
  type MailComposeAction,
  type MailComposeState,
} from "./mail-compose-state";
import type {
  ComposeDraft,
  ComposeMode,
  DraftSaveStatus,
} from "./mail-compose-types";
import {
  buildComposeSnapshot,
  buildNewComposeBodies,
  toComposeDraft,
  type ComposeSnapshot,
} from "./mail-compose-utils";

/** Fallback content check for reopened drafts and unseeded composes. */
function hasSavableContent(draft: ComposeDraft): boolean {
  return Boolean(
    draft.to.trim() ||
    draft.cc.trim() ||
    draft.bcc.trim() ||
    draft.subject.trim() ||
    draft.body.trim() ||
    draft.htmlBody.trim(),
  );
}

function toComposeTextFields(draft: ComposeDraft): ComposeTextFields {
  return {
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    // A plain-text message keeps its last rich HTML only for switching back, so its text is the body.
    body: !draft.plainTextMode && draft.htmlBody ? htmlToPlainText(draft.htmlBody) : draft.body,
  };
}

function patchAttachments(
  dispatch: Dispatch<MailComposeAction>,
  value: SetStateAction<File[]>,
  current: File[],
) {
  dispatch({
    type: "updateAttachments",
    updater:
      typeof value === "function"
        ? (attachments) => value(attachments)
        : () => value,
  });
}

export function useMailComposeController({
  identities,
  mailServerLimits,
  quoteDateOptions,
}: {
  identities: JmapIdentity[];
  mailServerLimits: MailServerLimits;
  quoteDateOptions: QuotedDateOptions;
}) {
  const [state, dispatch] = useReducer(
    mailComposeReducer,
    initialMailComposeState,
    (initial) => ({
      ...initial,
      selectedIdentityId: identities[0]?.id ?? null,
    }),
  );
  const sendSessionIdRef = useRef<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const baselineRef = useRef<ComposeSnapshot | null>(null);
  const seedTextRef = useRef<ComposeTextFields | null>(null);
  const explicitCloseRef = useRef(false);
  const closingRef = useRef(false);
  const plainSwitchTextRef = useRef<string | null>(null);
  const [sendLifetime] = useState(createMailSendScopeLifetime);
  useEffect(() => sendLifetime.activate(() => sendSessionIdRef.current ? `compose:${sendSessionIdRef.current}` : null), [sendLifetime]);

  const resolvedIdentityId =
    state.selectedIdentityId &&
    identities.some((entry) => entry.id === state.selectedIdentityId)
      ? state.selectedIdentityId
      : (identities[0]?.id ?? null);

  useEffect(() => {
    draftIdRef.current = state.draftId;
  }, [state.draftId]);

  const draft = toComposeDraft(
    {
      composeTo: state.composeTo,
      composeCc: state.composeCc,
      composeBcc: state.composeBcc,
      composeSubject: state.composeSubject,
      composeBody: state.composeBody,
      composeHtmlBody: state.composeHtmlBody,
      plainTextMode: state.plainTextMode,
      composeAttachments: state.composeAttachments,
      composeMode: state.composeMode,
      quotedAttachments: state.quotedAttachments,
      signatureChoice: state.signatureChoice,
      composeReplyContext: state.composeReplyContext,
    },
    resolvedIdentityId,
    state.draftId,
  );

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const markDirty = () => {
    /* baseline comparison handles dirty detection */
  };

  const acknowledgeSavedDraft = () => {
    baselineRef.current = buildComposeSnapshot(draftRef.current);
  };

  const isComposeDirty = () => {
    const baseline = baselineRef.current;
    if (!baseline) return true;
    return (
      JSON.stringify(buildComposeSnapshot(draftRef.current)) !==
      JSON.stringify(baseline)
    );
  };

  const hasUserContent = () => {
    const current = draftRef.current;
    const seed = seedTextRef.current;
    // An inserted or pasted image is content even when the text matches the seed.
    if (!current.plainTextMode && hasInsertedComposeImage(current.htmlBody)) return true;
    // A reopened draft already holds user content; only fresh composes compare against their seed.
    if (!seed || current.composeMode === "draft") {
      return hasSavableContent(current);
    }
    return hasComposeUserContent(toComposeTextFields(current), seed);
  };

  const bumpComposeSessionId = () => {
    dispatch({ type: "incrementSession" });
  };

  const closeCompose = (afterClose?: () => void) => {
    if (sendSessionIdRef.current) discardMailSendAttempt(`compose:${sendSessionIdRef.current}`);
    getComposeCloseActionsRef().current?.dismiss();
    afterClose?.();
  };

  const discardDraft = (draftId: string | null) => {
    if (draftId) getComposeCloseActionsRef().current?.discardDraft?.(draftId);
  };

  const notifyDraftSaved = (draftId: string) => {
    toast("Draft saved", {
      id: "compose-draft-saved",
      action: {
        label: "Open",
        onClick: () =>
          getComposeCloseActionsRef().current?.openDraft?.(draftId),
      },
      cancel: { label: "Discard", onClick: () => discardDraft(draftId) },
    });
  };

  const saveDraftAndClose = async (afterClose?: () => void) => {
    const savedDraftId = await flushComposeDraftSave();
    if (!savedDraftId && hasUserContent()) {
      // Keep compose open so a failed save never silently drops the message.
      toast.error("Couldn't save draft", {
        id: "compose-draft-saved",
        action: {
          label: "Discard",
          onClick: () => {
            discardDraft(draftIdRef.current);
            closeCompose(afterClose);
          },
        },
      });
      return;
    }
    const finishClose = () => {
      closeCompose(afterClose);
      if (savedDraftId) notifyDraftSaved(savedDraftId);
    };
    // Drafts are saved without file attachments, so dropping them needs explicit consent.
    if (draftRef.current.attachments.length > 0) {
      toast.error("Attachments aren't saved with drafts", {
        id: "compose-draft-saved",
        action: { label: "Close anyway", onClick: finishClose },
      });
      return;
    }
    finishClose();
  };

  const requestComposeClose = (afterClose?: () => void) => {
    if (!hasUserContent() && draftRef.current.attachments.length === 0) {
      cancelComposeDraftSave();
      // Drop a draft autosaved earlier in this session once its content was removed again.
      if (draftIdRef.current && draftRef.current.composeMode !== "draft") {
        discardDraft(draftIdRef.current);
      }
      return true;
    }
    if (!isComposeDirty() && draftRef.current.attachments.length === 0) {
      if (draftIdRef.current) notifyDraftSaved(draftIdRef.current);
      return true;
    }
    if (!closingRef.current) {
      closingRef.current = true;
      void saveDraftAndClose(afterClose)
        .catch(() => toast.error("Couldn't save draft"))
        .finally(() => {
          closingRef.current = false;
        });
    }
    return false;
  };

  // A message that opens as plain text but carries rich HTML (a draft) gets that HTML back on switching to rich, unless edited.
  const rememberPlainSwitch = (draft: ComposeDraft) => {
    plainSwitchTextRef.current = draft.plainTextMode && draft.htmlBody.trim() ? draft.body : null;
  };

  const resetDraftRefs = () => {
    if (sendSessionIdRef.current) discardMailSendAttempt(`compose:${sendSessionIdRef.current}`);
    sendSessionIdRef.current = createMailSendSessionId();
    draftIdRef.current = null;
    baselineRef.current = null;
    seedTextRef.current = null;
    explicitCloseRef.current = false;
    plainSwitchTextRef.current = null;
  };

  const applySeed = (seed: {
    patch: Partial<MailComposeState>;
    identityId?: string | null;
  }) => {
    resetComposeInlineImages();
    resetDraftRefs();
    const seededDraft = toComposeDraft(
      { ...state, ...seed.patch },
      seed.identityId ?? resolvedIdentityId,
      null,
    );
    // Baseline is the seeded state so an untouched reply/forward closes without saving a draft.
    baselineRef.current = buildComposeSnapshot(seededDraft);
    rememberPlainSwitch(seededDraft);
    seedTextRef.current = toComposeTextFields(seededDraft);
    dispatch({
      type: "patch",
      patch: {
        signatureChoice: undefined,
        isComposeMinimized: false,
        ...seed.patch,
        ...(seed.identityId !== undefined
          ? { selectedIdentityId: seed.identityId }
          : {}),
      },
    });
  };

  const resetDraft = () => {
    resetDraftRefs();
    dispatch({
      type: "resetDraft",
      selectedIdentityId: identities[0]?.id ?? null,
      plainTextMode: readMailComposeSettings().plainTextMode,
    });
  };

  const clearCompose = () => {
    resetDraftRefs();
    resetComposeInlineImages();
    dispatch({
      type: "clearComposeFields",
      selectedIdentityId: identities[0]?.id ?? null,
      plainTextMode: readMailComposeSettings().plainTextMode,
    });
  };

  const dismissCompose = () => {
    clearCompose();
    dispatch({
      type: "patch",
      patch: { isComposeOpen: false, isFullCompose: false, isComposeMinimized: false },
    });
  };

  const openNewCompose = () => {
    const seed = buildOpenNewComposeSeed(identities, resolvedIdentityId);
    applySeed(seed);
    const identity =
      identities.find((entry) => entry.id === resolvedIdentityId) ??
      identities[0] ??
      null;
    const seeded = buildNewComposeBodies(identity);
    baselineRef.current = buildComposeSnapshot({
      ...toComposeDraft(
        {
          composeTo: "",
          composeCc: "",
          composeBcc: "",
          composeSubject: "",
          composeBody: seeded.body,
          composeHtmlBody: seeded.htmlBody,
          plainTextMode: seeded.plainTextMode,
          composeAttachments: [],
          composeMode: "new",
          quotedAttachments: [],
          composeReplyContext: null,
        },
        resolvedIdentityId,
        null,
      ),
    });
  };

  const seedReply = (
    message: JmapEmailMessage,
    plaintext: string | null,
    mode: "reply" | "reply-all" = "reply",
  ) => {
    applySeed(
      buildReplySeed(
        message,
        plaintext,
        identities,
        resolvedIdentityId,
        quoteDateOptions,
        mode,
      ),
    );
  };

  const seedForward = (message: JmapEmailMessage, plaintext: string | null) => {
    applySeed(
      buildForwardSeed(
        message,
        plaintext,
        identities,
        resolvedIdentityId,
        quoteDateOptions,
      ),
    );
  };

  const seedNewMessage = (recipient: {
    email: string;
    name?: string | null;
  }) => {
    applySeed(buildNewMessageSeed(recipient, identities, resolvedIdentityId));
  };

  const seedMailto = (draft: MailtoDraft) => {
    applySeed(buildMailtoSeed(draft, identities, resolvedIdentityId));
  };

  const restoreDraft = (snapshot: ComposeDraft, draftId: string | null) => {
    resetDraftRefs();
    rememberPlainSwitch(snapshot);
    draftIdRef.current = draftId;
    dispatch({ type: "incrementSession" });
    dispatch({
      type: "patch",
      patch: {
        composeTo: snapshot.to,
        composeCc: snapshot.cc,
        composeBcc: snapshot.bcc,
        composeSubject: snapshot.subject,
        composeBody: snapshot.body,
        composeHtmlBody: snapshot.htmlBody,
        plainTextMode: snapshot.plainTextMode,
        composeAttachments: snapshot.attachments,
        composeReplyContext: snapshot.replyContext,
        composeMode: snapshot.composeMode,
        signatureChoice: snapshot.signatureChoice,
        selectedIdentityId: snapshot.identityId,
        draftId,
        isComposeOpen: true,
        isComposeMinimized: false,
      },
    });
  };

  // A mailto link from another tab's message arrives as an opaque fragment id, resolved once this tab's identities load.
  const mailtoLinkIdRef = useRef<string | null>(null);
  const seedMailtoLink = useEffectEvent((link: MailLink | null) => {
    mailtoLinkIdRef.current = "";
    const draft = link ? parseMailtoLink(link.href) : null;
    if (draft) seedMailto(draft);
  });
  const hasIdentities = identities.length > 0;
  useEffect(() => {
    if (mailtoLinkIdRef.current === null) mailtoLinkIdRef.current = takeMailLinkFragment();
    const id = mailtoLinkIdRef.current;
    if (!hasIdentities || !id) return;
    let current = true;
    resolveMailLink(id).then(
      (link) => {
        if (current) seedMailtoLink(link);
      },
      () => {
        if (current) seedMailtoLink(null);
      },
    );
    return () => {
      current = false;
    };
  }, [hasIdentities]);

  const seedDraft = (
    message: JmapEmailMessage,
    overrides?: {
      plaintext?: string | null;
      html?: string | null;
    },
  ) => {
    const seed = buildDraftSeed(
      message,
      identities,
      resolvedIdentityId,
      overrides,
    );
    applySeed(seed);
    if (seed.identityId) {
      draftIdRef.current = message.id;
    }
    baselineRef.current = buildComposeSnapshot(
      toComposeDraft(
        {
          composeTo: seed.patch.composeTo ?? "",
          composeCc: seed.patch.composeCc ?? "",
          composeBcc: seed.patch.composeBcc ?? "",
          composeSubject: seed.patch.composeSubject ?? "",
          composeBody: seed.patch.composeBody ?? "",
          composeHtmlBody: seed.patch.composeHtmlBody ?? "",
          plainTextMode: seed.patch.plainTextMode ?? false,
          composeAttachments: [],
          composeMode: (seed.patch.composeMode ?? "draft") as ComposeMode,
          quotedAttachments:
            (seed.patch.quotedAttachments as QuotedInlineAttachment[]) ?? [],
          composeReplyContext: seed.patch.composeReplyContext ?? null,
        },
        seed.identityId ?? null,
        message.id,
      ),
    );
  };

  const openDraftEditor = (
    message: JmapEmailMessage,
    overrides?: {
      plaintext?: string | null;
      html?: string | null;
    },
  ) => {
    bumpComposeSessionId();
    seedDraft(message, overrides);
  };

  useEffect(() => {
    composeBridgeRef.current = {
      getDraft: () => draftRef.current,
      getComposeSessionId: () => {
        if (!sendSessionIdRef.current) sendSessionIdRef.current = createMailSendSessionId();
        return sendSessionIdRef.current;
      },
      resetDraft,
      clearCompose,
      openNewCompose,
      seedReply,
      seedForward,
      seedNewMessage,
      restoreDraft,
      seedDraft,
      openDraftEditor,
      markDirty,
      isComposeDirty,
      hasUserContent,
      acknowledgeSavedDraft,
      bumpComposeSessionId,
      getDraftIdRef: () => draftIdRef.current,
      setDraftId: (id) => {
        draftIdRef.current = id;
        dispatch({ type: "patch", patch: { draftId: id } });
      },
      setDraftSaveStatus: (status: DraftSaveStatus) => {
        dispatch({ type: "patch", patch: { draftSaveStatus: status } });
      },
    };
  });

  // Clear only on unmount: a per-render cleanup would null the bridge while child autosave effects run.
  useEffect(
    () => () => {
      composeBridgeRef.current = null;
    },
    [],
  );

  const fieldsValue = {
    composeTo: state.composeTo,
    setComposeTo: (value: string) => {
      markDirty();
      dispatch({ type: "patch", patch: { composeTo: value } });
    },
    composeCc: state.composeCc,
    setComposeCc: (value: string) => {
      markDirty();
      dispatch({ type: "patch", patch: { composeCc: value } });
    },
    composeBcc: state.composeBcc,
    setComposeBcc: (value: string) => {
      markDirty();
      dispatch({ type: "patch", patch: { composeBcc: value } });
    },
    composeSubject: state.composeSubject,
    setComposeSubject: (value: string) => {
      markDirty();
      dispatch({ type: "patch", patch: { composeSubject: value } });
    },
    composeBody: state.composeBody,
    setComposeBody: (value: string) => {
      markDirty();
      dispatch({ type: "patch", patch: { composeBody: value } });
    },
    composeHtmlBody: state.composeHtmlBody,
    // An updater sees the latest body, so a late quoted-image load never overwrites typing that happened meanwhile.
    setComposeHtmlBody: (value: SetStateAction<string>) => {
      markDirty();
      dispatch({ type: "updateHtmlBody", updater: typeof value === "function" ? value : () => value });
    },
    plainTextMode: state.plainTextMode,
    setPlainTextMode: (next: boolean) => {
      if (next === state.plainTextMode) return;
      if (next) {
        const plain = composeHtmlToPlainText(state.composeHtmlBody);
        plainSwitchTextRef.current = plain;
        dispatch({ type: "patch", patch: { plainTextMode: true, composeBody: plain || state.composeBody } });
        return;
      }
      // The rich body comes back as it was unless the plain text was edited, which then becomes the body.
      const edited =
        plainSwitchTextRef.current !== state.composeBody || !state.composeHtmlBody.trim();
      plainSwitchTextRef.current = null;
      const html = edited ? plainTextToComposeHtml(state.composeBody) : state.composeHtmlBody;
      dispatch({
        type: "patch",
        patch: { plainTextMode: false, composeHtmlBody: html, composeBody: htmlToPlainText(html) },
      });
    },
    composeAttachments: state.composeAttachments,
    setComposeAttachments: (value: SetStateAction<File[]>) => {
      markDirty();
      patchAttachments(dispatch, value, state.composeAttachments);
    },
    mailServerLimits,
    selectedIdentityId: resolvedIdentityId,
    setSelectedIdentityId: (id: string | null) => {
      markDirty();
      dispatch({
        type: "patch",
        patch: { selectedIdentityId: id, signatureChoice: undefined },
      });
    },
    signatureChoice: state.signatureChoice,
    setSignatureChoice: (choice: string | null | undefined) => {
      dispatch({ type: "patch", patch: { signatureChoice: choice } });
    },
    draftSaveStatus: state.draftSaveStatus,
    setDraftSaveStatus: (status: DraftSaveStatus) => {
      dispatch({ type: "patch", patch: { draftSaveStatus: status } });
    },
    composeDraftId: state.draftId,
    clearCompose,
    composeMode: state.composeMode,
    composeReplySource: state.composeReplyContext?.sourceMessage ?? null,
    quotedAttachments: state.quotedAttachments,
    openNewCompose,
    composeSessionId: state.composeSessionId,
    requestComposeClose,
  };

  const chromeValue = {
    isComposeOpen: state.isComposeOpen,
    setIsComposeOpen: (open: boolean) => {
      dispatch({ type: "patch", patch: { isComposeOpen: open } });
    },
    isFullCompose: state.isFullCompose,
    setIsFullCompose: (open: boolean) => {
      dispatch({ type: "patch", patch: { isFullCompose: open } });
    },
    isComposeMinimized: state.isComposeMinimized,
    setIsComposeMinimized: (minimized: boolean) => {
      dispatch({ type: "patch", patch: { isComposeMinimized: minimized } });
    },
    dismissCompose,
  };

  return {
    fieldsValue,
    chromeValue,
  };
}
