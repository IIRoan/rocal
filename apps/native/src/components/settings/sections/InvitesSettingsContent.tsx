import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InviteRecord } from "@workspace/calendar-client";
import {
  getErrorMessage,
  getInviteCreateFeedback,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { SettingsPage } from "../SettingsPage";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
  SheetTextField,
} from "../../sheet/SheetSections";
import { useMailSkin, type MailSkin } from "../../mail/mail-ui";
import { useTheme } from "../../../providers/ThemeProvider";
import { useToast } from "../../../providers/ToastProvider";
import { inviteApiService } from "../../../lib/api";
import { APP_BASE_URL } from "../../../lib/constants";
import { QUERY_KEYS } from "../../../lib/query-keys";
import {
  INVITE_STATUS_LABELS,
  isInviteRecordActive,
  partitionInviteRecords,
  resolveInviteCopyValue,
} from "../../../lib/invite-settings";

type Feedback = {
  tone: "success" | "warning" | "error";
  text: string;
};

export function InvitesSettingsContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const invitesQuery = useQuery({
    queryKey: QUERY_KEYS.invites(),
    queryFn: () => inviteApiService.listInvites(),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (emailAddress: string) =>
      inviteApiService.createInvite(emailAddress),
    onSuccess: (data, emailAddress) => {
      setEmail("");
      const result = getInviteCreateFeedback(emailAddress, data);
      setFeedback({ tone: result.tone, text: result.text });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites() });
    },
    onError: (error) => {
      setFeedback({
        tone: "error",
        text: getErrorMessage(error, "Failed to create invite."),
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => inviteApiService.revokeInvite(id),
    onSuccess: () => {
      setRevokingId(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites() });
      toast("Invite revoked");
    },
    onError: (error) => {
      setRevokingId(null);
      setFeedback({
        tone: "error",
        text: getErrorMessage(error, "Failed to revoke invite."),
      });
    },
  });

  const invites = useMemo(
    () => invitesQuery.data?.invites ?? [],
    [invitesQuery.data],
  );
  const { active, inactive } = useMemo(
    () => partitionInviteRecords(invites),
    [invites],
  );

  const handleCreate = useCallback(() => {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      setFeedback({
        tone: "error",
        text: "Enter a valid email address.",
      });
      return;
    }
    setFeedback(null);
    createMutation.mutate(trimmed);
  }, [createMutation, email]);

  const handleCopy = useCallback(
    async (invite: InviteRecord) => {
      const value = resolveInviteCopyValue(invite, APP_BASE_URL);
      await Clipboard.setStringAsync(value);
      toast(APP_BASE_URL?.trim() ? "Invite link copied" : "Invite token copied");
    },
    [toast],
  );

  const handleRevoke = useCallback(
    (invite: InviteRecord) => {
      Alert.alert(
        "Revoke invite?",
        `Revoke the invite for ${invite.email}? They will no longer be able to use it.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Revoke",
            style: "destructive",
            onPress: () => {
              setRevokingId(invite.id);
              setFeedback(null);
              revokeMutation.mutate(invite.id);
            },
          },
        ],
      );
    },
    [revokeMutation],
  );

  return (
    <SettingsPage title="Invites">
      <SheetScroll>
        <SheetSection
          title="Invite someone"
          footer="Invite someone to join Solace. They get a link to use at sign-up."
        >
          <SheetGroup>
            <SheetTextField
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setFeedback(null);
              }}
              placeholder="friend@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              editable={!createMutation.isPending}
              accessibilityLabel="Email address to invite"
              onSubmitEditing={handleCreate}
            />
          </SheetGroup>
        </SheetSection>

        {feedback ? (
          <SheetMessage
            text={feedback.text}
            tone={feedback.tone === "error" ? "destructive" : "muted"}
          />
        ) : null}

        <SheetButton
          label="Send invite"
          icon="user-plus"
          onPress={handleCreate}
          pending={createMutation.isPending}
          disabled={!email.trim()}
        />

        {invitesQuery.isLoading ? (
          <SheetCenteredState message="Loading invites…" loading />
        ) : invites.length === 0 ? (
          <SheetCenteredState message="No invites yet. Send one above to get started." />
        ) : (
          <>
            {active.length > 0 ? (
              <InviteSection
                title="Active"
                invites={active}
                revokingId={revokingId}
                onCopy={handleCopy}
                onRevoke={handleRevoke}
              />
            ) : null}
            {inactive.length > 0 ? (
              <InviteSection
                title="Past"
                invites={inactive}
                revokingId={revokingId}
                onCopy={handleCopy}
                onRevoke={handleRevoke}
              />
            ) : null}
          </>
        )}
      </SheetScroll>
    </SettingsPage>
  );
}

function InviteSection({
  title,
  invites,
  revokingId,
  onCopy,
  onRevoke,
}: {
  title: string;
  invites: InviteRecord[];
  revokingId: string | null;
  onCopy: (invite: InviteRecord) => void;
  onRevoke: (invite: InviteRecord) => void;
}) {
  return (
    <SheetSection title={title}>
      <SheetGroup>
        {invites.map((invite) => (
          <InviteRow
            key={invite.id}
            invite={invite}
            revoking={revokingId === invite.id}
            onCopy={() => onCopy(invite)}
            onRevoke={() => onRevoke(invite)}
          />
        ))}
      </SheetGroup>
    </SheetSection>
  );
}

function InviteRow({
  invite,
  revoking,
  onCopy,
  onRevoke,
}: {
  invite: InviteRecord;
  revoking: boolean;
  onCopy: () => void;
  onRevoke: () => void;
}) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);
  const active = isInviteRecordActive(invite);
  const created = new Date(invite.createdAt);
  const createdLabel = Number.isNaN(created.getTime())
    ? ""
    : created.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

  return (
    <SheetItem
      label={invite.email}
      detail={`${INVITE_STATUS_LABELS[invite.status]}${createdLabel ? ` · ${createdLabel}` : ""}`}
      disabled={!active}
      trailing={
        active ? (
          <>
            <Pressable
              onPress={onCopy}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Copy invite for ${invite.email}`}
            >
              <Feather name="copy" size={16} color={skin.textSecondary} />
            </Pressable>
            <Pressable
              onPress={onRevoke}
              disabled={revoking}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Revoke invite for ${invite.email}`}
            >
              {revoking ? (
                <ActivityIndicator size="small" color={theme.colors.destructive} />
              ) : (
                <Feather name="x" size={16} color={theme.colors.destructive} />
              )}
            </Pressable>
          </>
        ) : undefined
      }
    />
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  return StyleSheet.create({
    iconButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.borderRadius.md,
    },
    iconButtonPressed: {
      backgroundColor: skin.selected,
    },
  });
}
