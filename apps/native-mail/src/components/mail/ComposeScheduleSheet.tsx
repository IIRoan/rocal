import { useState } from "react";
import {
  formatInstantCalendarDayKey,
  formatScheduledSendTime,
  getScheduledSendPresets,
  parseScheduledSendInput,
  resolveMailSendHold,
  scheduledSendLatest,
  parsedAddressesToEmails,
  validateComposeRecipients,
  resolveEncryptionInternalDomain,
  shouldEncryptOutgoingMail,
  SCHEDULED_SEND_EXTERNAL_NOTICE,
} from "@workspace/calendar-core";
import type { MailRuntime } from "../../lib/mail/mail-runtime";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import {
  BottomSheet,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import {
  SheetButton,
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetSection,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";

type ComposeScheduleSheetProps = {
  visible: boolean;
  runtime: MailRuntime | undefined;
  recipients: { to: string; cc: string; bcc: string };
  onSchedule: (sendAt: string) => void;
  onDismiss: () => void;
};

/** Send-later picker: presets plus a day and time in the user's zone, capped at 24 h when anyone is outside Solace. */
export function ComposeScheduleSheet({
  visible,
  runtime,
  recipients,
  onSchedule,
  onDismiss,
}: ComposeScheduleSheetProps) {
  const parsed = validateComposeRecipients(recipients);
  const emails = parsedAddressesToEmails([...parsed.to, ...parsed.cc, ...parsed.bcc]);
  const hasExternalRecipients =
    emails.length > 0 &&
    !shouldEncryptOutgoingMail(emails, resolveEncryptionInternalDomain(runtime?.config.defaultDomain));
  const maxDelayedSendSeconds = runtime?.mailServerPolicy.maxDelayedSendSeconds ?? 0;
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const [openedAt] = useState(() => Date.now());
  const [day, setDay] = useState(() => formatInstantCalendarDayKey(new Date(openedAt), timezone));
  const [time, setTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const policy = { maxDelayedSendSeconds };
  const latest = scheduledSendLatest(openedAt, policy, hasExternalRecipients);
  const presets = getScheduledSendPresets(new Date(openedAt), timezone, latest);

  const schedule = (sendAt: string | null, now: number) => {
    if (!sendAt) {
      setError("Enter the day as YYYY-MM-DD and the time as HH:MM.");
      return;
    }
    const resolved = resolveMailSendHold({ sendAt, undoSendSeconds: 0, policy, hasExternalRecipients, now });
    if (resolved.error) {
      setError(resolved.error);
      return;
    }
    setError(null);
    onDismiss();
    onSchedule(sendAt);
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoints={[0.7]}>
      <BottomSheetHeader>
        <BottomSheetTitle>Schedule send</BottomSheetTitle>
      </BottomSheetHeader>
      <BottomSheetScrollView>
        {presets.length > 0 ? (
          <SheetSection>
            <SheetGroup>
              {presets.map((preset) => (
                <SheetItem
                  key={preset.label}
                  icon="clock"
                  label={preset.label}
                  value={formatScheduledSendTime(preset.sendAt, timezone, timeFormat)}
                  onPress={() => schedule(preset.sendAt, Date.now())}
                />
              ))}
            </SheetGroup>
          </SheetSection>
        ) : null}
        <SheetSection
          title="Pick a time"
          footer={hasExternalRecipients ? SCHEDULED_SEND_EXTERNAL_NOTICE : undefined}
        >
          <SheetTextField
            value={day}
            onChangeText={setDay}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Day"
          />
          <SheetTextField
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Time"
          />
          {error ? <SheetMessage text={error} tone="destructive" /> : null}
        </SheetSection>
      </BottomSheetScrollView>
      <BottomSheetFooter>
        <SheetButton label="Schedule" onPress={() => schedule(parseScheduledSendInput(day, time, timezone), Date.now())} />
      </BottomSheetFooter>
    </BottomSheet>
  );
}
