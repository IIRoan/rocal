import { useEffect, useEffectEvent, useReducer } from "react";
import type { ComposeTextFields } from "@workspace/calendar-core";
import { getMailDraftSizeError } from "@workspace/calendar-core/mail-mime-limits";
import { classifyMessageEncryption, extractMessageBodies } from "../lib/mail/message-security";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import {
  composeFormReducer,
  INITIAL_COMPOSE_FORM,
} from "../lib/mail/compose-form";
import {
  decryptDraftFields,
  decryptMessagePlaintext,
  planComposeSeed,
  type ComposeSeedInput,
} from "../lib/mail/compose-seed";

type ComposeFormInput = Omit<ComposeSeedInput, "dateOptions"> & {
  onClose: () => void;
};

export function useComposeForm({ onClose, ...seedInput }: ComposeFormInput) {
  const { toast } = useToast();
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const [form, dispatch] = useReducer(composeFormReducer, INITIAL_COMPOSE_FORM);
  const { runtime, sourceMessage } = seedInput;
  const draftSizeError = sourceMessage && seedInput.params.mode === "draft" && classifyMessageEncryption(sourceMessage) === "plain"
    ? getMailDraftSizeError(extractMessageBodies(sourceMessage))
    : null;

  useEffect(() => {
    if (!draftSizeError) return;
    toast(draftSizeError, "error");
    onClose();
  }, [draftSizeError, onClose, toast]);

  // Seeded during render once the source message and settings are in, so the form never paints empty first.
  const seedPlan =
    form.seed || form.decrypting || draftSizeError
      ? null
      : planComposeSeed({ ...seedInput, dateOptions: { timeFormat, timezone } });
  if (seedPlan) dispatch({ type: "seed", plan: seedPlan });

  const finishDraftDecrypt = useEffectEvent(
    (fields: ComposeTextFields, decryptError: string | null) => {
      dispatch({ type: "decrypted", fields: decryptError ? null : fields });
      // An editor without the body would autosave over the encrypted draft, so it closes and leaves it intact.
      if (decryptError) {
        toast(decryptError, "error");
        onClose();
      }
    },
  );

  // A reply or forward whose source can't be decrypted still opens, with an empty quote instead of ciphertext.
  const finishSourceDecrypt = useEffectEvent((sourcePlaintext: string) => {
    const plan = planComposeSeed({
      ...seedInput,
      sourcePlaintext,
      dateOptions: { timeFormat, timezone },
    });
    dispatch({ type: "decrypted", fields: plan?.kind === "fields" ? plan.fields : null });
  });

  const isDraft = seedInput.params.mode === "draft";
  useEffect(() => {
    if (!form.decrypting || !runtime || !sourceMessage) return;
    let cancelled = false;
    if (isDraft) {
      void decryptDraftFields(runtime, sourceMessage)
        .then(({ fields, error: decryptError }) => {
          if (!cancelled) finishDraftDecrypt(fields, decryptError);
        })
        .catch(() => undefined);
    } else {
      void decryptMessagePlaintext(runtime, sourceMessage)
        .catch(() => "")
        .then((plaintext) => {
          if (!cancelled) finishSourceDecrypt(plaintext);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [form.decrypting, isDraft, runtime, sourceMessage]);

  return [form, dispatch] as const;
}
