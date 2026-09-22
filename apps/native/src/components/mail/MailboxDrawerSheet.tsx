import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { BottomSheet, BottomSheetScrollView } from "../BottomSheet";
import { WorkspaceAppSwitch } from "../WorkspaceAppSwitch";
import { InlineLoader } from "../ui/loading";
import { useDeferredSheetAction } from "../../hooks/use-deferred-sheet-action";
import { useWorkspaceTabSwitch } from "../../lib/use-workspace-tab-switch";
import { SETTINGS_MAILBOXES_ROUTE } from "../../lib/navigation-routes";
import { getMailboxDisplayName, getMailboxIcon } from "../../lib/mail/mail-helpers";
import type { JmapMailbox } from "../../lib/mail/types";
import { useMailSkin, type MailSkin } from "./mail-ui";

interface MailboxDrawerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  loading: boolean;
  mailboxes: JmapMailbox[];
  selectedMailboxId: string | null;
  onSelectMailbox: (mailboxId: string) => void;
}

/** Mail drawer: app switch and mailbox list. */
export function MailboxDrawerSheet({
  visible,
  onDismiss,
  loading,
  mailboxes,
  selectedMailboxId,
  onSelectMailbox,
}: MailboxDrawerSheetProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const router = useRouter();
  const switchTab = useWorkspaceTabSwitch();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);
  const { runAfterClose, onCloseComplete } = useDeferredSheetAction(onDismiss);

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onCloseComplete={onCloseComplete}
      snapPoints={[0.6, 0.92]}
      initialSnapIndex={0}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <WorkspaceAppSwitch
          activeApp="mail"
          onSwitch={(app) => runAfterClose(() => switchTab(app))}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Mail</Text>
            <SectionAction
              styles={styles}
              skin={skin}
              label="Manage mailboxes"
              onPress={() =>
                runAfterClose(() => router.push(SETTINGS_MAILBOXES_ROUTE as never))
              }
            />
          </View>
          {loading ? (
            <InlineLoader theme={theme} />
          ) : mailboxes.length === 0 ? (
            <Text style={styles.empty}>No mailboxes found.</Text>
          ) : (
            <View style={styles.card}>
              {mailboxes.map((mailbox, index) => {
                const active = mailbox.id === selectedMailboxId;
                return (
                  <Pressable
                    key={mailbox.id}
                    onPress={() => {
                      onSelectMailbox(mailbox.id);
                      onDismiss();
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && styles.rowDivider,
                      pressed && styles.rowPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={getMailboxDisplayName(mailbox)}
                    accessibilityState={{ selected: active }}
                  >
                    <Feather
                      name={getMailboxIcon(mailbox) as keyof typeof Feather.glyphMap}
                      size={17}
                      color={active ? theme.colors.foreground : skin.textSecondary}
                    />
                    <Text
                      style={[styles.rowLabel, active && styles.rowLabelActive]}
                      numberOfLines={1}
                    >
                      {getMailboxDisplayName(mailbox)}
                    </Text>
                    {active ? (
                      <Feather name="check" size={17} color={skin.accent} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function SectionAction({
  styles,
  skin,
  label,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  skin: MailSkin;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name="sliders" size={15} color={skin.textTertiary} />
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    content: {
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["1"],
      paddingBottom: theme.spacing["10"],
      gap: theme.spacing["5"],
    },
    section: {
      gap: theme.spacing["2"],
    },
    sectionHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    sectionAction: {
      width: 32,
      height: 32,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    pressed: {
      opacity: 0.6,
    },
    card: {
      borderRadius: theme.borderRadius.lg,
      backgroundColor: skin.field,
      overflow: "hidden" as const,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      minHeight: 48,
      paddingHorizontal: theme.spacing["3"],
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: skin.borderPrimary,
    },
    rowPressed: {
      backgroundColor: skin.selected,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    sectionTitle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600" as TextStyle["fontWeight"],
      letterSpacing: 0.6,
      textTransform: "uppercase" as const,
      color: skin.textTertiary,
    },
    rowLabel: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      color: skin.textSecondary,
    },
    rowLabelActive: {
      color: theme.colors.foreground,
      fontWeight: "600" as TextStyle["fontWeight"],
    },
    empty: {
      fontSize: 14,
      lineHeight: 19,
      color: skin.textTertiary,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
