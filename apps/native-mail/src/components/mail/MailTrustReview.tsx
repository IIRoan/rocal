import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import {
  MAIL_KEY_CONTINUITY_ENABLED,
  MAIL_TRUST_IDENTITY_NOTICE,
  MAIL_TRUST_RESET_WARNING,
  mailTrustProblemMessage,
  mailTrustReviewActions,
  type MailTrustProblem,
  type MailTrustReviewAction,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useMailTrustReview } from "@workspace/calendar-client/use-mail-trust-review";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import {
  SheetScroll,
  SheetSection,
  SheetMessage,
  SheetButton,
  SheetSwitchItem,
} from "@workspace/native-core/components/sheet/SheetSections";
import { mailTrustReviewBridge } from "../../lib/mail/mail-trust";

export function MailTrustReview() {
  if (!MAIL_KEY_CONTINUITY_ENABLED) return null;
  return <ActiveMailTrustReview />;
}
function ActiveMailTrustReview() {
  const { user } = useAuth();
  const review = useMailTrustReview(mailTrustReviewBridge, user?.id ?? null);
  if (!review.problem) return null;
  return (
    <MailTrustReviewDrawer
      key={review.reviewId}
      problem={review.problem}
      settle={review.settle}
    />
  );
}
type ReviewProps = {
  problem: MailTrustProblem;
  settle: (action: MailTrustReviewAction) => void;
};
export function MailTrustReviewDrawer({ problem, settle }: ReviewProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  return (
    <BottomSheet visible onDismiss={() => settle("cancel")}>
      <BottomSheetHeader>
        <BottomSheetTitle>
          {confirmReset ? "Reset saved key history?" : "Check encryption keys"}
        </BottomSheetTitle>
      </BottomSheetHeader>
      <SheetScroll>
        <SheetSection>
          <SheetMessage
            text={
              confirmReset
                ? MAIL_TRUST_RESET_WARNING
                : mailTrustProblemMessage(problem)
            }
          />
        </SheetSection>
        {confirmReset ? (
          <SheetSection>
            <SheetSwitchItem
              label="I understand all saved correspondent keys will be forgotten"
              value={resetAcknowledged}
              onValueChange={setResetAcknowledged}
            />
          </SheetSection>
        ) : (
          <>
            <MailTrustFacts problem={problem} />
            <MailTrustPinRemoval problem={problem} settle={settle} />
          </>
        )}
        <SheetSection>
          {confirmReset ? (
            <SheetButton
              label="Reset saved key history"
              variant="destructive"
              disabled={!resetAcknowledged}
              onPress={() => settle("reset")}
            />
          ) : (
            <MailTrustActions
              problem={problem}
              settle={settle}
              requestReset={() => setConfirmReset(true)}
            />
          )}
          <SheetButton
            label="Cancel"
            variant="secondary"
            onPress={() => settle("cancel")}
          />
        </SheetSection>
      </SheetScroll>
    </BottomSheet>
  );
}
function MailTrustFacts({ problem }: Pick<ReviewProps, "problem">) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  return (
    <>
      {problem.email ? (
        <SheetSection>
          <Text style={styles.text} selectable>
            {problem.email}
          </Text>
        </SheetSection>
      ) : null}
      {problem.oldFingerprint ? (
        <SheetSection title="Saved fingerprint">
          <Text style={styles.text} selectable>
            {problem.oldFingerprint}
          </Text>
        </SheetSection>
      ) : null}
      {problem.newFingerprint ? (
        <SheetSection title="Offered fingerprint">
          <Text style={styles.text} selectable>
            {problem.newFingerprint}
          </Text>
        </SheetSection>
      ) : null}
      <SheetSection>
        <SheetMessage text={MAIL_TRUST_IDENTITY_NOTICE} />
      </SheetSection>
    </>
  );
}
function MailTrustActions({
  problem,
  settle,
  requestReset,
}: ReviewProps & { requestReset: () => void }) {
  const actions = mailTrustReviewActions(problem);
  return (
    <>
      {actions.approve ? (
        <SheetButton
          label="Approve replacement"
          onPress={() => settle("approve")}
        />
      ) : null}
      {actions.retry ? (
        <SheetButton
          label="Retry"
          variant="secondary"
          onPress={() => settle("retry")}
        />
      ) : null}
      {actions.reset ? (
        <SheetButton
          label="Reset key history…"
          variant="secondary"
          onPress={requestReset}
        />
      ) : null}
    </>
  );
}
function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    text: {
      color: theme.colors.foreground,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
    },
  });
}

function MailTrustPinRemoval({ problem, settle }: ReviewProps) {
  const [selected, setSelected] = useState<{
    email: string;
    fingerprint: string;
  } | null>(null);
  if (problem.kind !== "capacity" || !problem.removablePins?.length)
    return null;
  if (selected)
    return (
      <SheetSection title="Remove one saved key">
        <SheetMessage
          text={`This forgets only the saved key for ${selected.email}. Compare that person's fingerprint through another trusted channel before sending to them again. Saved fingerprint: ${selected.fingerprint}`}
        />
        <SheetButton
          label="Remove selected saved key"
          variant="destructive"
          onPress={() => settle({ kind: "remove", ...selected })}
        />
        <SheetButton
          label="Choose another saved key"
          variant="secondary"
          onPress={() => setSelected(null)}
        />
      </SheetSection>
    );
  return (
    <SheetSection title="Make room for a new key">
      <SheetMessage text="Remove one saved key to make room. Every other saved key will be kept." />
      {problem.removablePins.map((pin) => (
        <SheetButton
          key={pin.email}
          label={`Select ${pin.email}`}
          variant="secondary"
          onPress={() => setSelected(pin)}
        />
      ))}
    </SheetSection>
  );
}
