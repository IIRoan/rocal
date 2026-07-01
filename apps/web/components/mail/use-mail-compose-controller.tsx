"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { MailServerLimits } from "@workspace/calendar-core";
import type { JmapEmailMessage, JmapIdentity } from "@/lib/mail/types";
import { htmlToPlainText } from "@/lib/mail/signature-utils";
import { resetComposeInlineImages } from "@/lib/mail/compose-inline-images";
import type { QuotedInlineAttachment } from "@/lib/mail/compose-editor-utils";
import {
  composeBridgeRef,
  flushComposeDraftSave,
  getComposeCloseActionsRef,
} from "./mail-compose-bridge";
import {
  buildDraftSeed,
  buildForwardSeed,
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
import type { ComposeMode, DraftSaveStatus } from "./mail-compose-types";
import {
  buildComposeSnapshot,
  buildNewComposeBodies,
  toComposeDraft,
  type ComposeSnapshot,
} from "./mail-compose-utils";

const pendingCloseActionRef: { current: (() => void) | null } = {
  current: null,
};

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
}: {
  identities: JmapIdentity[];
  mailServerLimits: MailServerLimits;
}) {
  const [state, dispatch] = useReducer(
    mailComposeReducer,
    initialMailComposeState,
    (initial) => ({
      ...initial,
      selectedIdentityId: identities[0]?.id ?? null,
    }),
  );
  const draftIdRef = useRef<string | null>(null);
  const baselineRef = useRef<ComposeSnapshot | null>(null);
  const explicitCloseRef = useRef(false);

  const resolvedIdentityId =
    state.selectedIdentityId &&
    identities.some((entry) => entry.id === state.selectedIdentityId)
      ? state.selectedIdentityId
      : (identities[0]?.id ?? null);

  useEffect(() => {
    draftIdRef.current = state.draftId;
  }, [state.draftId]);

  const draft = useMemo(
    () =>
      toComposeDraft(
        {
          composeTo: state.composeTo,
          composeCc: state.composeCc,
          composeBcc: state.composeBcc,
          composeSubject: state.composeSubject,
          composeBody: state.composeBody,
          composeHtmlBody: state.composeHtmlBody,
          composeAttachments: state.composeAttachments,
          composeMode: state.composeMode,
          quotedAttachments: state.quotedAttachments,
          signatureAlreadyEmbedded: state.signatureAlreadyEmbedded,
          composeReplyContext: state.composeReplyContext,
        },
        resolvedIdentityId,
        state.draftId,
      ),
    [
      state.composeTo,
      state.composeCc,
      state.composeBcc,
      state.composeSubject,
      state.composeBody,
      state.composeHtmlBody,
      state.composeAttachments,
      state.composeMode,
      state.quotedAttachments,
      state.signatureAlreadyEmbedded,
      state.composeReplyContext,
      resolvedIdentityId,
      state.draftId,
    ],
  );

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const markDirty = useCallback(() => {
    /* baseline comparison handles dirty detection */
  }, []);

  const captureComposeBaseline = useCallback(() => {
    baselineRef.current = buildComposeSnapshot(draftRef.current);
  }, []);

  const acknowledgeSavedDraft = useCallback(() => {
    baselineRef.current = buildComposeSnapshot(draftRef.current);
  }, []);

  const isComposeDirty = useCallback(() => {
    const baseline = baselineRef.current;
    if (!baseline) return true;
    return (
      JSON.stringify(buildComposeSnapshot(draftRef.current)) !==
      JSON.stringify(baseline)
    );
  }, []);

  const shouldConfirmComposeClose = useCallback(() => {
    if (isComposeDirty()) return true;
    if (draftIdRef.current) return true;
    return false;
  }, [isComposeDirty]);

  const runPendingCloseAction = useCallback(() => {
    const action = pendingCloseActionRef.current;
    pendingCloseActionRef.current = null;
    action?.();
  }, []);

  const bumpComposeSessionId = useCallback(() => {
    dispatch({ type: "incrementSession" });
  }, []);

  const requestComposeClose = useCallback(
    (afterClose?: () => void) => {
      if (!shouldConfirmComposeClose()) {
        pendingCloseActionRef.current = null;
        return true;
      }
      pendingCloseActionRef.current = afterClose ?? null;
      dispatch({ type: "patch", patch: { composeClosePromptOpen: true } });
      return false;
    },
    [shouldConfirmComposeClose],
  );

  const handleKeepEditing = useCallback(() => {
    pendingCloseActionRef.current = null;
    dispatch({ type: "patch", patch: { composeClosePromptOpen: false } });
  }, []);

  const handleSaveDraftAndClose = useCallback(async () => {
    dispatch({ type: "patch", patch: { composeClosePromptOpen: false } });
    await flushComposeDraftSave();
    getComposeCloseActionsRef().current?.dismiss();
    runPendingCloseAction();
  }, [runPendingCloseAction]);

  const handleDiscardAndClose = useCallback(() => {
    dispatch({ type: "patch", patch: { composeClosePromptOpen: false } });
    const currentDraftId = draftIdRef.current;
    if (currentDraftId) {
      getComposeCloseActionsRef().current?.discardDraft?.(currentDraftId);
    }
    getComposeCloseActionsRef().current?.dismiss();
    runPendingCloseAction();
  }, [runPendingCloseAction]);

  const resetDraftRefs = useCallback(() => {
    draftIdRef.current = null;
    baselineRef.current = null;
    explicitCloseRef.current = false;
  }, []);

  const applySeed = useCallback(
    (seed: {
      patch: Partial<MailComposeState>;
      identityId?: string | null;
    }) => {
      resetComposeInlineImages();
      resetDraftRefs();
      dispatch({
        type: "patch",
        patch: {
          ...seed.patch,
          ...(seed.identityId !== undefined
            ? { selectedIdentityId: seed.identityId }
            : {}),
        },
      });
    },
    [resetDraftRefs],
  );

  const resetDraft = useCallback(() => {
    resetDraftRefs();
    dispatch({
      type: "resetDraft",
      selectedIdentityId: identities[0]?.id ?? null,
    });
  }, [identities, resetDraftRefs]);

  const clearCompose = useCallback(() => {
    resetDraftRefs();
    resetComposeInlineImages();
    dispatch({
      type: "clearComposeFields",
      selectedIdentityId: identities[0]?.id ?? null,
    });
  }, [identities, resetDraftRefs]);

  const dismissCompose = useCallback(() => {
    clearCompose();
    dispatch({
      type: "patch",
      patch: { isComposeOpen: false, isFullCompose: false },
    });
  }, [clearCompose]);

  const openNewCompose = useCallback(() => {
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
          composeAttachments: [],
          composeMode: "new",
          quotedAttachments: [],
          signatureAlreadyEmbedded: seeded.signatureAlreadyEmbedded,
          composeReplyContext: null,
        },
        resolvedIdentityId,
        null,
      ),
    });
  }, [applySeed, identities, resolvedIdentityId]);

  const seedReply = useCallback(
    (message: JmapEmailMessage, plaintext: string | null) => {
      applySeed(
        buildReplySeed(message, plaintext, identities, resolvedIdentityId),
      );
    },
    [applySeed, identities, resolvedIdentityId],
  );

  const seedForward = useCallback(
    (message: JmapEmailMessage, plaintext: string | null) => {
      applySeed(
        buildForwardSeed(message, plaintext, identities, resolvedIdentityId),
      );
    },
    [applySeed, identities, resolvedIdentityId],
  );

  const seedNewMessage = useCallback(
    (recipient: { email: string; name?: string | null }) => {
      applySeed(
        buildNewMessageSeed(recipient, identities, resolvedIdentityId),
      );
    },
    [applySeed, identities, resolvedIdentityId],
  );

  const seedDraft = useCallback(
    (
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
            composeAttachments: [],
            composeMode: (seed.patch.composeMode ?? "draft") as ComposeMode,
            quotedAttachments:
              (seed.patch.quotedAttachments as QuotedInlineAttachment[]) ?? [],
            signatureAlreadyEmbedded: seed.patch.signatureAlreadyEmbedded ?? false,
            composeReplyContext: seed.patch.composeReplyContext ?? null,
          },
          seed.identityId ?? null,
          message.id,
        ),
      );
    },
    [applySeed, identities, resolvedIdentityId],
  );

  const openDraftEditor = useCallback(
    (
      message: JmapEmailMessage,
      overrides?: {
        plaintext?: string | null;
        html?: string | null;
      },
    ) => {
      bumpComposeSessionId();
      seedDraft(message, overrides);
    },
    [bumpComposeSessionId, seedDraft],
  );

  useEffect(() => {
    composeBridgeRef.current = {
      getDraft: () => draftRef.current,
      resetDraft,
      clearCompose,
      openNewCompose,
      seedReply,
      seedForward,
      seedNewMessage,
      seedDraft,
      openDraftEditor,
      markDirty,
      isComposeDirty,
      captureComposeBaseline,
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
    return () => {
      composeBridgeRef.current = null;
    };
  }, [
    resetDraft,
    clearCompose,
    openNewCompose,
    seedReply,
    seedForward,
    seedNewMessage,
    seedDraft,
    openDraftEditor,
    markDirty,
    isComposeDirty,
    captureComposeBaseline,
    acknowledgeSavedDraft,
    bumpComposeSessionId,
  ]);

  const fieldsValue = useMemo(
    () => ({
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
      setComposeHtmlBody: (value: string) => {
        markDirty();
        dispatch({
          type: "patch",
          patch: {
            composeHtmlBody: value,
            composeBody: htmlToPlainText(value),
          },
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
        dispatch({ type: "patch", patch: { selectedIdentityId: id } });
      },
      draftSaveStatus: state.draftSaveStatus,
      setDraftSaveStatus: (status: DraftSaveStatus) => {
        dispatch({ type: "patch", patch: { draftSaveStatus: status } });
      },
      composeDraftId: state.draftId,
      clearCompose,
      composeMode: state.composeMode,
      quotedAttachments: state.quotedAttachments,
      openNewCompose,
      composeSessionId: state.composeSessionId,
      requestComposeClose,
    }),
    [
      state,
      mailServerLimits,
      resolvedIdentityId,
      markDirty,
      clearCompose,
      openNewCompose,
      requestComposeClose,
    ],
  );

  const chromeValue = useMemo(
    () => ({
      isComposeOpen: state.isComposeOpen,
      setIsComposeOpen: (open: boolean) => {
        dispatch({ type: "patch", patch: { isComposeOpen: open } });
      },
      isFullCompose: state.isFullCompose,
      setIsFullCompose: (open: boolean) => {
        dispatch({ type: "patch", patch: { isFullCompose: open } });
      },
      dismissCompose,
    }),
    [state.isComposeOpen, state.isFullCompose, dismissCompose],
  );

  const closePromptValue = useMemo(
    () => ({
      composeClosePromptOpen: state.composeClosePromptOpen,
      setComposeClosePromptOpen: (open: boolean) => {
        dispatch({ type: "patch", patch: { composeClosePromptOpen: open } });
      },
      keepEditing: handleKeepEditing,
      saveDraftAndClose: handleSaveDraftAndClose,
      discardAndClose: handleDiscardAndClose,
    }),
    [
      state.composeClosePromptOpen,
      handleKeepEditing,
      handleSaveDraftAndClose,
      handleDiscardAndClose,
    ],
  );

  return {
    fieldsValue,
    chromeValue,
    closePromptValue,
  };
}
