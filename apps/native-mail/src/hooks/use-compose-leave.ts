import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import { Alert, BackHandler } from "react-native";
import type { BottomSheetHandle } from "@workspace/native-core/components/BottomSheet";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import type { ComposeFormState } from "../lib/mail/compose-form";
import type { ComposeMode } from "../lib/mail/compose-request";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { useMailMutations } from "../lib/mail/use-mail";
import { hasDraftContent, type DraftSaveResult } from "./use-compose-draft-autosave";

type ComposeLeaveInput = {
  runtime: MailRuntime | undefined;
  mode: ComposeMode | undefined;
  form: ComposeFormState;
  hasUserContent: boolean;
  saveDraft: () => Promise<DraftSaveResult>;
  sheetRef: RefObject<BottomSheetHandle | null>;
  visible: boolean;
  identityPickerOpen: boolean;
  closeIdentityPicker: () => void;
  onClose: () => void;
};

export function useComposeLeave({
  runtime,
  mode,
  form,
  hasUserContent,
  saveDraft,
  sheetRef,
  visible,
  identityPickerOpen,
  closeIdentityPicker,
  onClose,
}: ComposeLeaveInput) {
  const { toast } = useToast();
  const { moveToTrash } = useMailMutations(runtime, null);
  const { draftId, attachments } = form;
  const isDirty = hasUserContent || attachments.length > 0;

  // A swipe-close saves after the sheet is gone; its late close must not hit a compose opened meanwhile.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const leaveCompose = () => {
    if (mountedRef.current) onClose();
  };

  const handleDiscard = () => {
    if (draftId && runtime) {
      moveToTrash.mutate(draftId);
    }
    leaveCompose();
  };

  const leaveClean = () => {
    // Drop a draft autosaved earlier in this session once its content was removed again.
    if (draftId && mode !== "draft" && runtime) {
      moveToTrash.mutate(draftId);
    }
    leaveCompose();
  };

  const saveAndLeave = async () => {
    const leaveWithDraft = async () => {
      const result = await saveDraft();
      if (result.status === "failed") {
        // Stay open (reopening a swiped-away sheet) so a failed save never silently drops the message.
        toast("Couldn't save draft", "error");
        sheetRef.current?.snapTo(0);
        return;
      }
      if (result.status === "empty") {
        leaveClean();
        return;
      }
      toast("Draft saved", "success");
      leaveCompose();
    };
    await leaveWithDraft().catch(() => {
      // saveDraft reports its own failures; this only guards the leave path.
      toast("Couldn't save draft", "error");
      sheetRef.current?.snapTo(0);
    });
  };

  const handleCancel = () => {
    if (!isDirty) {
      leaveClean();
      return;
    }

    const saveOption = hasDraftContent(form)
      ? [{ text: "Save Draft", onPress: () => void saveAndLeave() }]
      : [];
    Alert.alert(
      "Draft",
      attachments.length > 0 ? "Attachments aren't saved with drafts." : undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Draft",
          style: "destructive",
          onPress: handleDiscard,
        },
        ...saveOption,
      ],
    );
  };

  // Swipe-down and backdrop taps keep text as a draft; drafts don't store attachments, so those still prompt.
  const handleSheetDismiss = () => {
    if (!isDirty) {
      leaveClean();
      return;
    }
    if (attachments.length > 0) {
      sheetRef.current?.snapTo(0);
      handleCancel();
      return;
    }
    void saveAndLeave();
  };

  const handleHardwareBack = useEffectEvent(() => {
    if (identityPickerOpen) {
      closeIdentityPicker();
    } else {
      handleCancel();
    }
    return true;
  });

  // Registered once per open: re-registering each render would put it above the identity picker's handler.
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => handleHardwareBack(),
    );
    return () => subscription.remove();
  }, [visible]);

  return { cancel: handleCancel, dismiss: handleSheetDismiss };
}
