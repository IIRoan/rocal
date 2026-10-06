import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import type { InviteRecord } from "@workspace/calendar-client";
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
import { APP_BASE_URL } from "../../../lib/constants";
import {
  useCreateInvite,
  useInvites,
  useRevokeInvite,
  type InviteFeedback,
} from "../../../hooks/use-invites";
import {
  INVITE_STATUS_LABELS,
  isInviteRecordActive,
  partitionInviteRecords,
  resolveInviteCopyValue,
} from "../../../lib/invite-settings";

export function InvitesSettingsContent() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<InviteFeedback | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const invitesQuery = useInvites();

  const createMutation = useCreateInvite({
    onCreated: () => setEmail(""),
    onFeedback: setFeedback,
  });

  const revokeMutation = useRevokeInvite({
    onRevoked: () => setRevokingId(null),
    onFeedback: setFeedback,
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
