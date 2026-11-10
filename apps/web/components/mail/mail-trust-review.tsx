"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MAIL_KEY_CONTINUITY_ENABLED,
  MAIL_TRUST_IDENTITY_NOTICE,
  MAIL_TRUST_RESET_WARNING,
  mailTrustProblemMessage,
  mailTrustReviewActions,
  type MailTrustProblem,
  type MailTrustReviewAction,
} from "@workspace/calendar-core";
import { useMailTrustReview } from "@workspace/calendar-client/use-mail-trust-review";
import { Button } from "@workspace/ui/components/ui/button";
import { Checkbox } from "@workspace/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import {
  configureMailTrustQueryClient,
  mailTrustReviewBridge,
} from "@/lib/mail/mail-trust";

export function MailTrustReview({ accountId }: { accountId: string | null }) {
  if (!MAIL_KEY_CONTINUITY_ENABLED) return null;
  return <ActiveMailTrustReview accountId={accountId} />;
}
function ActiveMailTrustReview({ accountId }: { accountId: string | null }) {
  const queries = useQueryClient();
  const review = useMailTrustReview(mailTrustReviewBridge, accountId);
  useEffect(() => configureMailTrustQueryClient(queries), [queries]);
  if (!review.problem) return null;
  return (
    <MailTrustReviewDialog
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
export function MailTrustReviewDialog({ problem, settle }: ReviewProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) settle("cancel");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {confirmReset
              ? "Reset saved key history?"
              : "Check encryption keys"}
          </DialogTitle>
          <DialogDescription>
            {confirmReset
              ? MAIL_TRUST_RESET_WARNING
              : mailTrustProblemMessage(problem)}
          </DialogDescription>
        </DialogHeader>
        {confirmReset ? (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={resetAcknowledged}
              onCheckedChange={(value) => setResetAcknowledged(value === true)}
              aria-label="I understand all saved correspondent keys will be forgotten"
            />
            I understand all saved correspondent keys will be forgotten.
          </label>
        ) : (
          <>
            <MailTrustFacts problem={problem} />
            <MailTrustPinRemoval problem={problem} settle={settle} />
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => settle("cancel")}>
            Cancel
          </Button>
          {confirmReset ? (
            <Button
              variant="destructive"
              disabled={!resetAcknowledged}
              onClick={() => settle("reset")}
            >
              Reset saved key history
            </Button>
          ) : (
            <MailTrustActions
              problem={problem}
              settle={settle}
              requestReset={() => setConfirmReset(true)}
            />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function MailTrustFacts({ problem }: Pick<ReviewProps, "problem">) {
  return (
    <>
      {problem.email ? (
        <p className="text-sm break-all">{problem.email}</p>
      ) : null}
      {problem.oldFingerprint ? (
        <p className="text-sm">
          Saved fingerprint
          <br />
          <code className="text-xs break-all select-text">
            {problem.oldFingerprint}
          </code>
        </p>
      ) : null}
      {problem.newFingerprint ? (
        <p className="text-sm">
          Offered fingerprint
          <br />
          <code className="text-xs break-all select-text">
            {problem.newFingerprint}
          </code>
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {MAIL_TRUST_IDENTITY_NOTICE}
      </p>
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
      {actions.reset ? (
        <Button variant="outline" onClick={requestReset}>
          Reset key history…
        </Button>
      ) : null}
      {actions.retry ? (
        <Button variant="outline" onClick={() => settle("retry")}>
          Retry
        </Button>
      ) : null}
      {actions.approve ? (
        <Button onClick={() => settle("approve")}>Approve replacement</Button>
      ) : null}
    </>
  );
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
      <div className="flex flex-col gap-2 text-sm">
        <p>
          This forgets only the saved key for {selected.email}. Compare that
          person&apos;s fingerprint through another trusted channel before
          sending to them again.
        </p>
        <code className="break-all text-xs">{selected.fingerprint}</code>
        <Button
          variant="destructive"
          onClick={() => settle({ kind: "remove", ...selected })}
        >
          Remove selected saved key
        </Button>
        <Button variant="outline" onClick={() => setSelected(null)}>
          Choose another saved key
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Remove one saved key to make room. Every other saved key will be kept.
      </p>
      <div
        className="flex max-h-48 flex-col gap-1 overflow-y-auto"
        aria-label="Saved keys available to remove"
      >
        {problem.removablePins.map((pin) => (
          <Button
            key={pin.email}
            variant="outline"
            className="justify-start truncate"
            onClick={() => setSelected(pin)}
          >
            Select {pin.email}
          </Button>
        ))}
      </div>
    </div>
  );
}
