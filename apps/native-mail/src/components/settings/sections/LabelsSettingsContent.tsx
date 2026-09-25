import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { SettingsPage } from "@workspace/native-core/components/settings/SettingsPage";
import { useMailSkin, MAIL_ICON, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetGroupBlock,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useMailAccount, useMailRuntime } from "../../../lib/mail/use-mail";
import {
  LABEL_COLOR_OPTIONS,
  useLabels,
} from "../../../lib/mail/use-labels";

export function LabelsSettingsContent() {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
  const { toast } = useToast();
  const accountQuery = useMailAccount();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const { labels, loaded, createLabel, deleteLabel } = useLabels({
    runtime: runtimeQuery.data ?? null,
    enabled: provisioned,
  });
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLOR_OPTIONS[5]?.value ?? "#3b82f6");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await createLabel(trimmed, color);
      setName("");
      toast(`Created "${trimmed}"`);
    } catch (error) {
      toast(getErrorMessage(error, "Failed to create label"), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (labelId: string, labelName: string) => {
    Alert.alert("Delete label?", `Remove “${labelName}” from this account?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          deleteLabel(labelId)
            .then(() => toast(`Deleted “${labelName}”`))
            .catch((error) => {
              toast(getErrorMessage(error, "Failed to delete label"), "error");
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  if (!provisioned) {
    return (
      <SettingsPage title="Labels">
        <SheetCenteredState message="Set up mail first, then you can create labels here." />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Labels">
      <SheetScroll>
        <SheetSection
          title="Labels"
          footer="Labels stay in your encrypted mail vault on this device and sync with web."
        >
          {!loaded && runtimeQuery.isLoading ? (
            <SheetCenteredState loading message="Loading labels…" />
          ) : labels.length === 0 ? (
            <SheetMessage text="No labels yet." />
          ) : (
            <SheetGroup>
              {labels.map((label) => (
                <SheetItem
                  key={label.id}
                  label={label.name}
                  swatch={label.color}
                  trailing={
                    <Pressable
                      onPress={() => handleDelete(label.id, label.name)}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        pressed && styles.deleteButtonPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${label.name}`}
                    >
                      <Feather
                        name="trash-2"
                        size={16}
                        color={theme.colors.destructive}
                      />
                    </Pressable>
                  }
                />
              ))}
            </SheetGroup>
          )}
        </SheetSection>

        <SheetSection title="New label">
          <SheetGroup>
            <SheetTextField
              value={name}
              onChangeText={setName}
              placeholder="Label name"
              editable={!busy}
              returnKeyType="done"
              onSubmitEditing={() => void handleCreate()}
              accessibilityLabel="Label name"
            />
            <SheetGroupBlock>
              <View style={styles.colorRow}>
                {LABEL_COLOR_OPTIONS.map((option) => {
                  const selected = color === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setColor(option.value)}
                      style={[
                        styles.colorOption,
                        selected && styles.colorOptionSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected }}
                    >
                      <View
                        style={[styles.colorChip, { backgroundColor: option.value }]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </SheetGroupBlock>
          </SheetGroup>
        </SheetSection>

        <SheetButton
          label="Create label"
          onPress={() => void handleCreate()}
          disabled={!name.trim()}
          pending={busy}
        />
      </SheetScroll>
    </SettingsPage>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  return StyleSheet.create({
    deleteButton: {
      width: 32,
      height: 32,
      borderRadius: theme.borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteButtonPressed: {
      backgroundColor: skin.selected,
    },
    colorRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing["2"],
    },
    colorOption: {
      width: MAIL_ICON.sheet + 12,
      height: MAIL_ICON.sheet + 12,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 2,
      borderColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    colorOptionSelected: {
      borderColor: theme.colors.foreground,
    },
    colorChip: {
      width: MAIL_ICON.sheet,
      height: MAIL_ICON.sheet,
      borderRadius: theme.borderRadius.md,
    },
  });
}
