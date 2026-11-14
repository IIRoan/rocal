import React, { useState } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";
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
import type { ThemeTokens } from "@workspace/design-tokens";
import { SettingsPage } from "@workspace/native-core/components/settings/SettingsPage";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetScroll,
  SheetSection,
  SheetSwitchItem,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useMailVacationResponse } from "../../../hooks/use-mail-vacation-response";

export function VacationReplySettingsContent() {
  const timezone = useUserTimezone();
  const vacation = useMailVacationResponse();

  if (vacation.loading) {
    return (
      <SettingsPage title="Auto-reply">
        <SheetCenteredState loading message="Loading auto-reply…" />
      </SettingsPage>
    );
  }

  if (!vacation.supported || vacation.loadError) {
    return (
      <SettingsPage title="Auto-reply">
        <SheetCenteredState
          message={
            vacation.supported
              ? getErrorMessage(vacation.loadError, "Couldn't load the auto-reply.")
              : VACATION_REPLY_UNAVAILABLE
          }
        />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Auto-reply">
      <VacationReplyForm
        key={vacation.dataUpdatedAt}
        initial={vacationResponseToForm(vacation.response, timezone)}
        timezone={timezone}
        saving={vacation.saving}
        onSave={vacation.save}
      />
    </SettingsPage>
  );
}

function VacationReplyForm({
  initial,
  timezone,
  saving,
  onSave,
}: {
  initial: MailVacationForm;
  timezone: string;
  saving: boolean;
  onSave: (update: VacationResponseUpdate) => Promise<void>;
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { toast } = useToast();
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const error = submitted ? validateVacationForm(form) : null;
  const patch = (next: Partial<MailVacationForm>) => setForm((current) => ({ ...current, ...next }));

  const save = () => {
    setSubmitted(true);
    if (validateVacationForm(form)) return;
    onSave(vacationFormToUpdate(form, timezone)).then(
      () => toast("Auto-reply saved", "success"),
      (saveError: unknown) => toast(getErrorMessage(saveError, "Couldn't save the auto-reply."), "error"),
    );
  };

  const dayError = error?.field === "fromDay" || error?.field === "toDay" ? error.message : null;
  const messageError = error?.field === "subject" || error?.field === "text" ? error.message : null;

  return (
    <SheetScroll>
      <SheetSection>
        <SheetGroup>
          <SheetSwitchItem
            label="Send auto-reply"
            detail="Answer new mail automatically, once per sender"
            value={form.enabled}
            onValueChange={(enabled) => patch({ enabled })}
          />
        </SheetGroup>
      </SheetSection>

      <SheetSection title="Dates" footer="Optional. Without dates it replies until you turn it off.">
        <SheetGroup>
          <SheetTextField
            value={form.fromDay}
            onChangeText={(fromDay) => patch({ fromDay })}
            placeholder="First day (YYYY-MM-DD)"
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            accessibilityLabel="First day"
          />
          <SheetTextField
            value={form.toDay}
            onChangeText={(toDay) => patch({ toDay })}
            placeholder="Last day (YYYY-MM-DD)"
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            accessibilityLabel="Last day"
          />
        </SheetGroup>
        {dayError ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {dayError}
          </Text>
        ) : null}
      </SheetSection>

      <SheetSection title="Message" footer={VACATION_REPLY_SERVER_NOTICE}>
        <SheetGroup>
          <SheetTextField
            value={form.subject}
            onChangeText={(subject) => patch({ subject })}
            placeholder="Automated reply"
            maxLength={VACATION_SUBJECT_MAX_CHARS}
            accessibilityLabel="Subject"
          />
          <SheetTextField
            value={form.text}
            onChangeText={(text) => patch({ text })}
            placeholder="Message"
            multiline
            maxLength={VACATION_REPLY_MAX_CHARS}
            style={styles.message}
            accessibilityLabel="Message"
          />
        </SheetGroup>
        {messageError ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {messageError}
          </Text>
        ) : null}
      </SheetSection>

      <SheetButton label="Save" onPress={save} pending={saving} />
    </SheetScroll>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    error: {
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["2"],
      fontSize: 13,
      lineHeight: 17,
      color: theme.colors.destructive,
    } satisfies TextStyle,
    message: {
      minHeight: 120,
      textAlignVertical: "top",
    } satisfies TextStyle,
  });
}
