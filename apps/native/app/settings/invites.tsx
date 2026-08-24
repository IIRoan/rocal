import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InviteRecord } from "@workspace/calendar-client";
import {
  getErrorMessage,
  getInviteCreateFeedback,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";
import { inviteApiService } from "../../src/lib/api";
import { APP_BASE_URL } from "../../src/lib/constants";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import {
  INVITE_STATUS_LABELS,
  isInviteRecordActive,
  partitionInviteRecords,
  resolveInviteCopyValue,
} from "../../src/lib/invite-settings";

type Feedback = {
  tone: "success" | "warning" | "error";
  text: string;
};

export default function InvitesScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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

  const invites = invitesQuery.data?.invites ?? [];
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
    <AppScreen header={<StackScreenHeader title="Invites" />}>
      <View style={styles.addForm}>
        <Text style={styles.addHint}>
          Invite someone to join Solace. They get a link to use at sign-up.
        </Text>
        {feedback ? (
          <View
            style={[
              styles.feedback,
              feedback.tone === "error"
                ? styles.feedbackError
                : feedback.tone === "warning"
                  ? styles.feedbackWarning
                  : styles.feedbackSuccess,
            ]}
          >
            <Text
              style={[
                styles.feedbackText,
                feedback.tone === "error"
                  ? styles.feedbackTextError
                  : feedback.tone === "warning"
                    ? styles.feedbackTextWarning
                    : styles.feedbackTextSuccess,
              ]}
            >
              {feedback.text}
            </Text>
          </View>
        ) : null}
        <TextInput
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setFeedback(null);
          }}
          placeholder="friend@example.com"
          placeholderTextColor={theme.colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          editable={!createMutation.isPending}
          style={styles.fieldInput}
          accessibilityLabel="Email address to invite"
          onSubmitEditing={handleCreate}
        />
        <Pressable
          onPress={handleCreate}
          disabled={createMutation.isPending || !email.trim()}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            (createMutation.isPending || !email.trim()) && styles.disabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Send invite"
        >
          {createMutation.isPending ? (
            <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
          ) : (
            <>
              <Feather
                name="user-plus"
                size={14}
                color={theme.colors.primaryForeground}
              />
              <Text style={styles.primaryButtonText}>Invite</Text>
            </>
          )}
        </Pressable>
      </View>

      {invitesQuery.isLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={theme.colors.primaryBase} />
          <Text style={styles.emptyText}>Loading invites…</Text>
        </View>
      ) : invites.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            No invites yet. Send one above to get started.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {active.length > 0 ? (
            <InviteSection
              title="Active"
              invites={active}
              revokingId={revokingId}
              onCopy={handleCopy}
              onRevoke={handleRevoke}
              theme={theme}
            />
          ) : null}
          {inactive.length > 0 ? (
            <InviteSection
              title="Past"
              invites={inactive}
              revokingId={revokingId}
              onCopy={handleCopy}
              onRevoke={handleRevoke}
              theme={theme}
            />
          ) : null}
        </ScrollView>
      )}
    </AppScreen>
  );
}

function InviteSection({
  title,
  invites,
  revokingId,
  onCopy,
  onRevoke,
  theme,
}: {
  title: string;
  invites: InviteRecord[];
  revokingId: string | null;
  onCopy: (invite: InviteRecord) => void;
  onRevoke: (invite: InviteRecord) => void;
  theme: ThemeTokens;
}) {
  return (
    <View>
      <Text
        style={{
          paddingHorizontal: theme.spacing["4"],
          paddingTop: theme.spacing["3"],
          paddingBottom: theme.spacing["1"],
          fontSize: theme.typography.fontSize.xs.size,
          lineHeight: theme.typography.fontSize.xs.lineHeight,
          fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
          color: theme.colors.mutedForeground,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {invites.map((invite) => (
        <InviteRow
          key={invite.id}
          invite={invite}
          revoking={revokingId === invite.id}
          onCopy={() => onCopy(invite)}
          onRevoke={() => onRevoke(invite)}
          theme={theme}
        />
      ))}
    </View>
  );
}

function InviteRow({
  invite,
  revoking,
  onCopy,
  onRevoke,
  theme,
}: {
  invite: InviteRecord;
  revoking: boolean;
  onCopy: () => void;
  onRevoke: () => void;
  theme: ThemeTokens;
}) {
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
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing["3"],
        paddingHorizontal: theme.spacing["4"],
        paddingVertical: theme.spacing["3"],
        minHeight: 56,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
        opacity: active ? 1 : 0.6,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
            fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
          }}
          numberOfLines={1}
        >
          {invite.email}
        </Text>
        <Text
          style={{
            marginTop: 2,
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
          numberOfLines={1}
        >
          {INVITE_STATUS_LABELS[invite.status]}
          {createdLabel ? ` · ${createdLabel}` : ""}
        </Text>
      </View>
      {active ? (
        <>
          <Pressable
            onPress={onCopy}
            style={({ pressed }) => [
              {
                width: 36,
                height: 36,
                alignItems: "center" as const,
                justifyContent: "center" as const,
                borderRadius: theme.borderRadius.md,
              },
              pressed && { backgroundColor: theme.colors.accent },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Copy invite for ${invite.email}`}
          >
            <Feather name="copy" size={16} color={theme.colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={onRevoke}
            disabled={revoking}
            style={({ pressed }) => [
              {
                width: 36,
                height: 36,
                alignItems: "center" as const,
                justifyContent: "center" as const,
                borderRadius: theme.borderRadius.md,
              },
              pressed && { backgroundColor: theme.colors.accent },
            ]}
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
      ) : null}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    addForm: {
      padding: theme.spacing["4"],
      gap: theme.spacing["2"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    primaryButton: {
      marginTop: theme.spacing["1"],
      minHeight: 44,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    pressed: {
      opacity: 0.85,
    },
    disabled: {
      opacity: 0.5,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingBottom: theme.spacing["8"],
    },
    emptyState: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      padding: theme.spacing["6"],
      gap: theme.spacing["2"],
    },
    fieldInput: {
      height: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing["3"],
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.background,
    } as ViewStyle & TextStyle,
    feedback: {
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
    },
    feedbackSuccess: {
      borderColor: theme.colors.primaryBase + "40",
      backgroundColor: theme.colors.primaryBase + "18",
    },
    feedbackWarning: {
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.muted + "40",
    },
    feedbackError: {
      borderColor: theme.colors.destructive + "40",
      backgroundColor: theme.colors.destructive + "18",
    },
  } satisfies Record<string, ViewStyle | (ViewStyle & TextStyle)>;

  const text = {
    addHint: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    emptyText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      textAlign: "center" as const,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.primaryForeground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    feedbackText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
    },
    feedbackTextSuccess: {
      color: theme.colors.foreground,
    },
    feedbackTextWarning: {
      color: theme.colors.mutedForeground,
    },
    feedbackTextError: {
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
