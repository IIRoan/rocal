import { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { useSidebar } from "../../../src/providers/SidebarProvider";
import { useMailSelection } from "../../../src/providers/MailSelectionProvider";
import { useCommandPalette } from "../../../src/providers/CommandPaletteProvider";
import { AppSwitcher } from "../../../src/components/AppSwitcher";
import { MailMessageRow } from "../../../src/components/mail/MailMessageRow";
import {
  useMailAccount,
  useMailMutations,
  useMailRuntime,
  useMailboxMessages,
} from "../../../src/lib/mail/use-mail";
import { getMailboxIcon, getPrimaryMailboxId } from "../../../src/lib/mail/mail-helpers";
import {
  isWebMailAvailable,
  openWebMail,
} from "../../../src/lib/mail/mail-web-bridge";
import type { JmapEmailMessage, JmapMailbox } from "../../../src/lib/mail/types";

const SENDER_AS_RECIPIENT_ROLES = new Set(["sent", "drafts"]);

export default function MailScreen() {
  const { theme } = useTheme();
  const { toggle: toggleSidebar } = useSidebar();
  const { open: openCommandPalette } = useCommandPalette();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const accountQuery = useMailAccount();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data;

  const { selectedMailboxId, setSelectedMailboxId } = useMailSelection();

  useEffect(() => {
    if (!runtime || selectedMailboxId) return;
    const inbox =
      getPrimaryMailboxId(runtime.mailboxes, "inbox") ??
      runtime.mailboxes[0]?.id ??
      null;
    setSelectedMailboxId(inbox);
  }, [runtime, selectedMailboxId, setSelectedMailboxId]);

  const messagesQuery = useMailboxMessages(runtime, selectedMailboxId);
  const { markAsRead } = useMailMutations(runtime, selectedMailboxId);

  const selectedMailbox = runtime?.mailboxes.find(
    (m) => m.id === selectedMailboxId,
  );
  const showRecipient = selectedMailbox?.role
    ? SENDER_AS_RECIPIENT_ROLES.has(selectedMailbox.role)
    : false;

  const handleOpenMessage = useCallback(
    (message: JmapEmailMessage) => {
      if (runtime && !message.keywords?.["$seen"]) {
        markAsRead.mutate(message.id);
      }
      router.push(`/(tabs)/mail/message/${message.id}` as never);
    },
    [router, runtime, markAsRead],
  );

  const renderItem = useCallback(
    ({ item }: { item: JmapEmailMessage }) => (
      <MailMessageRow
        message={item}
        showRecipient={showRecipient}
        onPress={handleOpenMessage}
      />
    ),
    [handleOpenMessage, showRecipient],
  );

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={toggleSidebar}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <Feather name="menu" size={22} color={theme.colors.foreground} />
      </Pressable>
      <AppSwitcher active="mail" />
      <View style={styles.headerRight}>
        <Pressable
          onPress={openCommandPalette}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Search and commands"
        >
          <Feather name="search" size={20} color={theme.colors.foreground} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/(tabs)/mail/compose" as never)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Compose message"
        >
          <Feather name="edit" size={20} color={theme.colors.foreground} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {header}

      {accountQuery.isLoading ? (
        <CenteredState theme={theme}>
          <ActivityIndicator color={theme.colors.primaryBase} />
        </CenteredState>
      ) : accountQuery.isError ? (
        <ErrorState
          theme={theme}
          message={getErrorMessage(accountQuery.error, "Failed to load mail")}
          onRetry={() => accountQuery.refetch()}
        />
      ) : !provisioned ? (
        <SetupState theme={theme} />
      ) : runtimeQuery.isLoading ? (
        <CenteredState theme={theme}>
          <ActivityIndicator color={theme.colors.primaryBase} />
          <Text style={styles.mutedText}>Connecting to your mailbox…</Text>
        </CenteredState>
      ) : runtimeQuery.isError ? (
        <ErrorState
          theme={theme}
          message={getErrorMessage(
            runtimeQuery.error,
            "Failed to connect to your mailbox",
          )}
          onRetry={() => runtimeQuery.refetch()}
        />
      ) : (
        <>
          <MailboxBar
            theme={theme}
            mailboxes={runtime?.mailboxes ?? []}
            selectedId={selectedMailboxId}
            onSelect={setSelectedMailboxId}
          />
          <FlatList
            data={messagesQuery.data?.messages ?? []}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ItemSeparatorComponent={() => (
              <View style={styles.separator} />
            )}
            refreshing={messagesQuery.isFetching && !messagesQuery.isLoading}
            onRefresh={() => messagesQuery.refetch()}
            contentContainerStyle={
              (messagesQuery.data?.messages?.length ?? 0) === 0
                ? styles.emptyListContent
                : undefined
            }
            ListEmptyComponent={
              messagesQuery.isLoading ? (
                <CenteredState theme={theme}>
                  <ActivityIndicator color={theme.colors.primaryBase} />
                </CenteredState>
              ) : (
                <CenteredState theme={theme}>
                  <Feather
                    name="inbox"
                    size={40}
                    color={theme.colors.mutedForeground}
                  />
                  <Text style={styles.mutedText}>No messages here</Text>
                </CenteredState>
              )
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

function CenteredState({
  theme,
  children,
}: {
  theme: ThemeTokens;
  children: React.ReactNode;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <View style={styles.centered}>{children}</View>;
}

function ErrorState({
  theme,
  message,
  onRetry,
}: {
  theme: ThemeTokens;
  message: string;
  onRetry: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.centered}>
      <Feather
        name="alert-triangle"
        size={36}
        color={theme.colors.destructive}
      />
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Try again</Text>
      </Pressable>
      {isWebMailAvailable() ? (
        <Pressable onPress={() => openWebMail()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Open secure web mail</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SetupState({ theme }: { theme: ThemeTokens }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.centered}>
      <Feather name="mail" size={44} color={theme.colors.primaryBase} />
      <Text style={styles.setupTitle}>Set up your mailbox</Text>
      <Text style={styles.mutedText}>
        Your encrypted mailbox is created in the secure web client. Once it’s
        ready, your messages appear here automatically.
      </Text>
      {isWebMailAvailable() ? (
        <Pressable onPress={() => openWebMail()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Open secure web mail</Text>
        </Pressable>
      ) : (
        <Text style={styles.mutedText}>
          Configure the web app URL (EXPO_PUBLIC_APP_URL) to enable setup.
        </Text>
      )}
    </View>
  );
}

function MailboxBar({
  theme,
  mailboxes,
  selectedId,
  onSelect,
}: {
  theme: ThemeTokens;
  mailboxes: JmapMailbox[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.mailboxBarWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mailboxBar}
      >
        {mailboxes.map((mailbox) => {
          const active = mailbox.id === selectedId;
          return (
            <Pressable
              key={mailbox.id}
              onPress={() => onSelect(mailbox.id)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Feather
                name={getMailboxIcon(mailbox) as keyof typeof Feather.glyphMap}
                size={14}
                color={
                  active
                    ? theme.colors.primaryForeground
                    : theme.colors.mutedForeground
                }
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {mailbox.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    iconButton: {
      width: 38,
      height: 38,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    headerRight: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
    },
    mailboxBarWrap: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    mailboxBar: {
      flexDirection: "row" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
    },
    chip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    chipActive: {
      backgroundColor: theme.colors.primaryBase,
      borderColor: theme.colors.primaryBase,
    },
    separator: {
      height: 1,
      marginLeft: theme.spacing["4"] + 40 + theme.spacing["3"],
      backgroundColor: theme.colors.border,
    },
    centered: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["6"],
    },
    emptyListContent: {
      flexGrow: 1,
    },
    primaryButton: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    secondaryButton: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    mutedText: {
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    errorText: {
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    setupTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    chipText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    chipTextActive: {
      color: theme.colors.primaryForeground,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
