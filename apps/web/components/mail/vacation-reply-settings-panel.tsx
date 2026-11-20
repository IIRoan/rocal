"use client";

import { useId, useState } from "react";
import { Reply } from "lucide-react";
import {
  getErrorMessage,
  VACATION_REPLY_MAX_CHARS,
  VACATION_REPLY_SERVER_NOTICE,
  VACATION_REPLY_UNAVAILABLE,
  VACATION_SUBJECT_MAX_CHARS,
  vacationFormToUpdate,
  vacationResponseToForm,
  validateVacationForm,
  type MailVacationForm,
  type VacationResponseUpdate,
} from "@workspace/calendar-core";
import { Textarea } from "@workspace/ui/components/ui/textarea";
import { toast } from "@workspace/ui/lib/toast";
import {
  useMailVacationResponse,
  type MailConnection,
} from "@/hooks/use-mail-vacation-response";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteField,
  PaletteFormActions,
  PaletteView,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";

export function VacationReplySettingsPanel({
  goBack,
  connection,
  userId,
  timezone,
}: {
  goBack: () => void;
  connection: MailConnection | null;
  userId: string | null;
  timezone?: string | null;
}) {
  const vacation = useMailVacationResponse(connection, userId);

  return (
    <PaletteView title="Auto-reply" onBack={goBack}>
      {vacation.loading ? (
        <PaletteEmptyState>Loading auto-reply…</PaletteEmptyState>
      ) : !vacation.supported || vacation.loadError ? (
        <PaletteEmptyState>
          {vacation.supported
            ? getErrorMessage(vacation.loadError, "Couldn't load the auto-reply.")
            : VACATION_REPLY_UNAVAILABLE}
        </PaletteEmptyState>
      ) : (
        <VacationReplyForm
          key={vacation.dataUpdatedAt}
          initial={vacationResponseToForm(vacation.response, timezone)}
          timezone={timezone}
          saving={vacation.saving}
          onSave={vacation.save}
        />
      )}
    </PaletteView>
  );
}

function VacationReplyForm({
  initial,
  timezone,
  saving,
  onSave,
}: {
  initial: MailVacationForm;
  timezone?: string | null;
  saving: boolean;
  onSave: (update: VacationResponseUpdate) => Promise<void>;
}) {
  const id = useId();
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const error = submitted ? validateVacationForm(form) : null;
  const errorId = `${id}-error`;
  const patch = (next: Partial<MailVacationForm>) =>
    setForm((current) => ({ ...current, ...next }));
  const fieldError = (field: keyof MailVacationForm) =>
    error?.field === field
      ? { "aria-invalid": true, "aria-describedby": errorId }
      : {};

  const save = () => {
    setSubmitted(true);
    if (validateVacationForm(form)) return;
    onSave(vacationFormToUpdate(form, timezone)).then(
      () => toast.success("Auto-reply saved."),
      (saveError: unknown) =>
        toast.error(getErrorMessage(saveError, "Couldn't save the auto-reply.")),
    );
  };

  return (
    <>
      <SettingToggleRow
        icon={Reply}
        label="Send auto-reply"
        description="Answer new mail automatically, once per sender"
        checked={form.enabled}
        onToggle={() => patch({ enabled: !form.enabled })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <PaletteField label="First day" htmlFor={`${id}-from`} hint="Optional">
          <input
            id={`${id}-from`}
            type="date"
            value={form.fromDay}
            onChange={(event) => patch({ fromDay: event.target.value })}
            className={PALETTE_INPUT_CLASS}
            {...fieldError("fromDay")}
          />
        </PaletteField>
        <PaletteField label="Last day" htmlFor={`${id}-to`} hint="Optional">
          <input
            id={`${id}-to`}
            type="date"
            value={form.toDay}
            min={form.fromDay || undefined}
            onChange={(event) => patch({ toDay: event.target.value })}
            className={PALETTE_INPUT_CLASS}
            {...fieldError("toDay")}
          />
        </PaletteField>
      </div>
      <PaletteField label="Subject" htmlFor={`${id}-subject`}>
        <input
          id={`${id}-subject`}
          type="text"
          value={form.subject}
          maxLength={VACATION_SUBJECT_MAX_CHARS}
          placeholder="Automated reply"
          autoComplete="off"
          onChange={(event) => patch({ subject: event.target.value })}
          className={PALETTE_INPUT_CLASS}
          {...fieldError("subject")}
        />
      </PaletteField>
      <PaletteField
        label="Message"
        htmlFor={`${id}-text`}
        hint={VACATION_REPLY_SERVER_NOTICE}
      >
        <Textarea
          id={`${id}-text`}
          value={form.text}
          maxLength={VACATION_REPLY_MAX_CHARS}
          rows={5}
          onChange={(event) => patch({ text: event.target.value })}
          className="bg-muted text-base text-foreground md:text-[15px]"
          {...fieldError("text")}
        />
      </PaletteField>
      {error ? (
        <p id={errorId} className="px-2 text-[13px] leading-[130%] text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <PaletteFormActions>
        <PaletteButton variant="primary" loading={saving} onClick={save}>
          Save
        </PaletteButton>
      </PaletteFormActions>
    </>
  );
}
