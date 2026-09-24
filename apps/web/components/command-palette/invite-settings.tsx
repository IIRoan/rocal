"use client";

import React, { useState } from "react";
import {
  UserPlus,
  X,
  Copy,
  Check,
  Mail,
  Loader2,
  Users,
  RotateCcw,
} from "lucide-react";
import {
  getErrorMessage,
  getInviteCreateFeedback,
} from "@workspace/calendar-core";
import { inviteApiService } from "@/lib/api-clients";
import type { InviteRecord } from "@workspace/calendar-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteIconBox,
  PaletteSection,
  PaletteView,
} from "./palette-ui";
import { PALETTE_INPUT_CLASS } from "./palette-styles";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

interface InviteSettingsProps {
  goBack: () => void;
}

type SectionMessage =
  | { kind: "success"; text: string }
  | { kind: "warning"; text: string }
  | { kind: "error"; text: string }
  | null;

const STATUS_LABELS: Record<InviteRecord["status"], string> = {
  pending: "Pending",
  claimed: "Claimed",
  accepted: "Accepted",
  revoked: "Revoked",
};

const STATUS_COLORS: Record<InviteRecord["status"], string> = {
  pending: "text-warning",
  claimed: "text-info",
  accepted: "text-success",
  revoked: "text-muted-foreground line-through",
};

function isInviteActive(invite: InviteRecord): boolean {
  return invite.status === "pending" || invite.status === "claimed";
}

function isInviteExpired(invite: InviteRecord): boolean {
  return new Date(invite.expiresAt) < new Date();
}

function InviteRow({
  invite,
  onRevoke,
  revoking,
}: {
  invite: InviteRecord;
  onRevoke: (id: string) => void;
  revoking: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isActive = isInviteActive(invite);
  const isExpired = isActive && isInviteExpired(invite);

  async function copyToken() {
    await navigator.clipboard.writeText(invite.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={`flex items-start gap-3 p-2 ${
        invite.status === "revoked" || isExpired ? "opacity-50" : ""
      }`}
    >
      <PaletteIconBox>
        <Mail className="size-4" />
      </PaletteIconBox>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] leading-[130%] text-foreground">
          {invite.email}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] leading-[130%]">
          <span className={STATUS_COLORS[invite.status]}>
            {STATUS_LABELS[invite.status]}
            {isExpired ? " (expired)" : ""}
          </span>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">
            {format(new Date(invite.createdAt), "MMM d, yyyy")}
          </span>
        </div>
        {isActive && !isExpired && (
          <div className="mt-1.5 flex items-center gap-1">
            <code className="max-w-[180px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {invite.token}
            </code>
            <SimpleTooltip content="Copy invite token">
              <button
                type="button"
                onClick={copyToken}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Copy invite token"
              >
                {copied ? (
                  <Check className="size-3.5 text-success" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </SimpleTooltip>
          </div>
        )}
      </div>
      {isActive && !isExpired && (
        <SimpleTooltip content="Revoke invite">
          <button
            type="button"
            onClick={() => onRevoke(invite.id)}
            disabled={revoking}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            aria-label="Revoke invite"
          >
            {revoking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <X className="size-4" />
            )}
          </button>
        </SimpleTooltip>
      )}
    </div>
  );
}

export function InviteSettings({ goBack }: InviteSettingsProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<SectionMessage>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["invites"],
    queryFn: () => inviteApiService.listInvites(),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (emailAddress: string) =>
      inviteApiService.createInvite(emailAddress),
    onSuccess: (data, emailAddress) => {
      setEmail("");
      const feedback = getInviteCreateFeedback(emailAddress, data);
      setMessage({
        kind: feedback.tone === "warning" ? "warning" : "success",
        text: feedback.text,
      });
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (err: unknown) => {
      setMessage({
        kind: "error",
        text: getErrorMessage(err, "Failed to create invite."),
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => inviteApiService.revokeInvite(id),
    onSuccess: () => {
      setRevokingId(null);
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (err: unknown) => {
      setRevokingId(null);
      setMessage({
        kind: "error",
        text: getErrorMessage(err, "Failed to revoke invite."),
      });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setMessage({ kind: "error", text: "Please enter an email address." });
      return;
    }
    setMessage(null);
    createMutation.mutate(trimmed);
  }

  function handleRevoke(id: string) {
    setRevokingId(id);
    setMessage(null);
    revokeMutation.mutate(id);
  }

  const invites = data?.invites ?? [];
  const activeInvites = invites.filter(
    (invite) => isInviteActive(invite) && !isInviteExpired(invite),
  );
  const inactiveInvites = invites.filter(
    (invite) => !isInviteActive(invite) || isInviteExpired(invite),
  );

  return (
    <PaletteView
      title="Invites"
      onBack={goBack}
      actions={
        <SimpleTooltip content="Refresh invites">
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh invites"
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </SimpleTooltip>
      }
    >
      <p className="p-2 text-[13px] leading-[130%] text-muted-foreground">
        Invite someone to join Solace. They&apos;ll receive a token to use at
        sign-up.
      </p>

      {message && (
        <div className="px-2 py-1">
          <div
            className={`rounded-lg px-3 py-2 text-[13px] ${
              message.kind === "success"
                ? "bg-success/10 text-success"
                : message.kind === "warning"
                  ? "bg-warning/10 text-warning"
                  : "bg-destructive/10 text-destructive"
            }`}
          >
            {message.text}
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="flex gap-2 px-2 pt-2 pb-3">
        <div className="flex-1">
          <input
            id="invite-email"
            aria-label="Email address to invite"
            type="email"
            placeholder="friend@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setMessage(null);
            }}
            disabled={createMutation.isPending}
            className={PALETTE_INPUT_CLASS}
            autoComplete="off"
          />
        </div>
        <PaletteButton
          type="submit"
          variant="primary"
          loading={createMutation.isPending}
          disabled={!email.trim()}
          className="h-9 shrink-0"
        >
          {createMutation.isPending ? null : (
            <>
              <UserPlus className="size-4" />
              Invite
            </>
          )}
        </PaletteButton>
      </form>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {activeInvites.length > 0 && (
            <PaletteSection label="Active Invites">
              {activeInvites.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  onRevoke={handleRevoke}
                  revoking={revokingId === invite.id}
                />
              ))}
            </PaletteSection>
          )}

          {inactiveInvites.length > 0 && (
            <PaletteSection label="Past Invites">
              {inactiveInvites.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  onRevoke={handleRevoke}
                  revoking={revokingId === invite.id}
                />
              ))}
            </PaletteSection>
          )}

          {invites.length === 0 && (
            <PaletteEmptyState>
              <span className="block text-[15px]">No invites yet</span>
              <span className="block text-muted-foreground/70">
                Invite someone above to get started
              </span>
            </PaletteEmptyState>
          )}
        </>
      )}
    </PaletteView>
  );
}
