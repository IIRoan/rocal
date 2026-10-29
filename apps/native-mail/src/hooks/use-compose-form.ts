import { useEffect, useEffectEvent, useReducer } from "react";
import type { ComposeTextFields } from "@workspace/calendar-core";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import {
  composeFormReducer,
  INITIAL_COMPOSE_FORM,
} from "../lib/mail/compose-form";
import {
  decryptDraftFields,
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

  // Seeded during render once the source message and settings are in, so the form never paints empty first.
  const seedPlan =
    form.seed || form.decrypting
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

  useEffect(() => {
    if (!form.decrypting || !runtime || !sourceMessage) return;
    let cancelled = false;
    void decryptDraftFields(runtime, sourceMessage)
      .then(({ fields, error: decryptError }) => {
        if (!cancelled) finishDraftDecrypt(fields, decryptError);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [form.decrypting, runtime, sourceMessage]);

  return [form, dispatch] as const;
}
