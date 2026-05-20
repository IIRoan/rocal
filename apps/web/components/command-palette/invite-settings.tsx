"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  ArrowLeft,
  UserPlus,
  X,
  Copy,
  Check,
  Mail,
  Loader2,
  Users,
  RotateCcw,
} from "lucide-react";
import { getErrorMessage } from "@workspace/calendar-core";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { inviteApiService } from "@/lib/invite-api-service";
import type { InviteRecord } from "@workspace/calendar-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

interface InviteSettingsProps {
  goBack: () => void;
}

type SectionMessage =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | null;

const STATUS_LABELS: Record<InviteRecord["status"], string> = {
  pending: "Pending",
  claimed: "Claimed",
  accepted: "Accepted",
  revoked: "Revoked",
};

const STATUS_COLORS: Record<InviteRecord["status"], string> = {
  pending: "text-amber-500 dark:text-amber-400",
  claimed: "text-blue-500 dark:text-blue-400",
  accepted: "text-emerald-500 dark:text-emerald-400",
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

  const copyToken = useCallback(async () => {
    await navigator.clipboard.writeText(invite.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [invite.token]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-0 ${
        invite.status === "revoked" || isExpired ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-center size-8 rounded-full bg-muted shrink-0 mt-0.5">
        <Mail className="size-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{invite.email}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={`text-xs font-medium ${STATUS_COLORS[invite.status]}`}
          >
            {STATUS_LABELS[invite.status]}
            {isExpired ? " (expired)" : ""}
          </span>
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(invite.createdAt), "MMM d, yyyy")}
          </span>
        </div>
        {isActive && !isExpired && (
          <div className="flex items-center gap-1 mt-1.5">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-[180px]">
              {invite.token}
            </code>
            <button
              type="button"
              onClick={copyToken}
              className="p-1 rounded hover:bg-muted/80 transition-colors shrink-0"
              title="Copy invite token"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5 text-muted-foreground" />
              )}
            </button>
          </div>
        )}
      </div>
      {isActive && !isExpired && (
        <button
          type="button"
          onClick={() => onRevoke(invite.id)}
          disabled={revoking}
          className="p-1.5 rounded hover:bg-destructive/10 transition-colors shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
          title="Revoke invite"
        >
          {revoking ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <X className="size-4" />
          )}
        </button>
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
    onSuccess: (_data, emailAddress) => {
      setEmail("");
      setMessage({
        kind: "success",
        text: `Invite email sent to ${emailAddress}.`,
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

  const handleCreate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) {
        setMessage({ kind: "error", text: "Please enter an email address." });
        return;
      }
      setMessage(null);
      createMutation.mutate(trimmed);
    },
    [email, createMutation],
  );

  const handleRevoke = useCallback(
    (id: string) => {
      setRevokingId(id);
      setMessage(null);
      revokeMutation.mutate(id);
    },
    [revokeMutation],
  );

  const invites = data?.invites ?? [];
  const activeInvites = invites.filter(
    (invite) => isInviteActive(invite) && !isInviteExpired(invite),
  );
  const inactiveInvites = invites.filter(
    (invite) => !isInviteActive(invite) || isInviteExpired(invite),
  );

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "clamp(300px, 55svh, 480px)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          onClick={goBack}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <Users className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Invites</span>
        <button
          onClick={() => refetch()}
          className="ml-auto p-1 rounded hover:bg-muted/50 transition-colors"
          title="Refresh invites"
        >
          <RotateCcw className="size-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Create invite form */}
        <div className="px-4 pt-4 pb-3">
          <p className="text-xs text-muted-foreground mb-3">
            Invite someone to join Solace. They&apos;ll receive a token to use
            at sign-up.
          </p>

          {message && (
            <div
              className={`mb-3 rounded-lg px-3 py-2 text-xs ${
                message.kind === "success"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleCreate} className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="invite-email" className="sr-only">
                Email address to invite
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="friend@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setMessage(null);
                }}
                disabled={createMutation.isPending}
                className="h-9 text-sm"
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isPending || !email.trim()}
              className="h-9 px-3 shrink-0"
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="size-4 mr-1.5" />
                  Invite
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Active invites */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {activeInvites.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/40">
                  Active Invites
                </div>
                {activeInvites.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    invite={invite}
                    onRevoke={handleRevoke}
                    revoking={revokingId === invite.id}
                  />
                ))}
              </div>
            )}

            {inactiveInvites.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/40">
                  Past Invites
                </div>
                {inactiveInvites.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    invite={invite}
                    onRevoke={handleRevoke}
                    revoking={revokingId === invite.id}
                  />
                ))}
              </div>
            )}

            {invites.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                <UserPlus className="size-8 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">No invites yet</p>
                <p className="text-xs text-muted-foreground/70">
                  Invite someone above to get started
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
