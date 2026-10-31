import React, { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  partitionCalendarsByKind,
  type UserSettings,
} from "@workspace/calendar-core";
import {
  RIFTBOUND_SETTINGS_COPY as COPY,
  riftboundDurationOptions,
  type RiftboundStore,
} from "@workspace/calendar-core/riftbound-settings";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  useMailSkin,
  type MailSkin,
} from "@workspace/native-core/components/mail/mail-ui";
import { useNativeUserSettings } from "@workspace/native-core/hooks/use-native-user-settings";
import { SettingsPage } from "@workspace/native-core/components/settings/SettingsPage";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
  SheetSwitchItem,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useSettingsCalendars } from "../../../hooks/use-calendar-settings";
import { useNativeRiftboundForm } from "../../../hooks/use-riftbound";

export function RiftboundSettingsContent() {
  const { settings, isLoading, isError, saveSetting } = useNativeUserSettings();
  if (isLoading)
    return (
      <SettingsPage title="Riftbound">
        <SheetCenteredState loading message="Loading settings…" />
      </SettingsPage>
    );
  if (!settings || isError)
    return (
      <SettingsPage title="Riftbound">
        <SheetCenteredState
          tone="destructive"
          message="Riftbound settings could not be loaded."
        />
      </SettingsPage>
    );
  return (
    <RiftboundForm
      key={settings.userId}
      settings={settings}
      saveSettings={async (riftbound, isCurrent) => {
        await saveSetting({ riftbound }, isCurrent);
      }}
    />
  );
}

function RiftboundForm({
  settings,
  saveSettings,
}: {
  settings: UserSettings;
  saveSettings: (
    preferences: NonNullable<UserSettings["riftbound"]>,
    isCurrent: () => boolean,
  ) => Promise<void>;
}) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
  const { data: calendars = [] } = useSettingsCalendars();
  const form = useNativeRiftboundForm(settings.riftbound, saveSettings);
  const { draft, setDraft } = form;
  const removeStore = useCallback(
    (id: string) =>
      setDraft((previous) => ({
        ...previous,
        stores: previous.stores.filter((store) => store.id !== id),
      })),
    [setDraft],
  );
  const owned = partitionCalendarsByKind(calendars).ownedCalendars;
  const syncing = form.sync.isPending || form.backgroundPending;
  const canAddStore =
    !!form.eventUrl.trim() && !form.store.isPending && draft.stores.length < 10;
  const addStore = () => {
    if (canAddStore) form.store.mutate(form.eventUrl);
  };
  return (
    <SettingsPage title="Riftbound">
      <SheetScroll>
        <SheetSection footer={COPY.registeredNote}>
          <SheetGroup>
            <SheetSwitchItem
              icon="calendar"
              label={COPY.importLabel}
              detail={COPY.importDescription}
              value={draft.enabled}
              onValueChange={(enabled) => setDraft({ ...draft, enabled })}
            />
            <SheetSwitchItem
              icon="user-check"
              label={COPY.registeredLabel}
              detail={COPY.registeredDescription}
              value={draft.registeredOnly}
              onValueChange={(registeredOnly) =>
                setDraft({ ...draft, registeredOnly })
              }
            />
          </SheetGroup>
        </SheetSection>

        {draft.registeredOnly ? (
          <SheetSection title="Riot ID" footer={COPY.riotIdHint}>
            <SheetGroup>
              <SheetTextField
                accessibilityLabel="Riot ID"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={100}
                value={draft.riotId}
                onChangeText={(riotId) => setDraft({ ...draft, riotId })}
                placeholder="Player Name#TAG"
              />
            </SheetGroup>
          </SheetSection>
        ) : null}

        <SheetSection title="Add a store" footer={COPY.storesHint}>
          <SheetGroup>
            <SheetTextField
              accessibilityLabel="Play Riftbound event link"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={addStore}
              value={form.eventUrl}
              onChangeText={form.setEventUrl}
              placeholder="Paste an event link"
            />
          </SheetGroup>
        </SheetSection>
        {form.store.isError ? (
          <SheetMessage tone="destructive" text={COPY.storeError} />
        ) : null}
        <SheetButton
          label="Add store"
          icon="plus"
          variant="secondary"
          pending={form.store.isPending}
          disabled={!canAddStore}
          onPress={addStore}
        />

        <SheetSection title="Frequent stores">
          {draft.stores.length ? (
            <SheetGroup>
              {draft.stores.map((store) => (
                <StoreRow key={store.id} store={store} onRemove={removeStore} />
              ))}
            </SheetGroup>
          ) : (
            <SheetMessage text={COPY.noStores} />
          )}
        </SheetSection>

        <SheetSection title="Destination calendar">
          {owned.length ? (
            <SheetGroup>
              {owned.map((calendar) => {
                const selected = draft.calendarId === calendar.id;
                return (
                  <SheetItem
                    key={calendar.id}
                    label={calendar.name}
                    checked={selected}
                    onPress={() =>
                      setDraft({ ...draft, calendarId: calendar.id })
                    }
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  />
                );
              })}
            </SheetGroup>
          ) : (
            <SheetMessage text={COPY.noCalendars} />
          )}
        </SheetSection>

        <SheetSection title="Event length" footer={COPY.durationHint}>
          <SheetGroup>
            {riftboundDurationOptions(draft.durationMinutes).map((option) => {
              const selected = draft.durationMinutes === option.value;
              return (
                <SheetItem
                  key={option.value}
                  label={option.label}
                  checked={selected}
                  onPress={() =>
                    setDraft({ ...draft, durationMinutes: option.value })
                  }
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, theme.spacing["3"]) },
        ]}
      >
        {form.status ? (
          <SheetMessage
            tone={form.status.tone === "error" ? "destructive" : "muted"}
            text={form.status.text}
          />
        ) : null}
        <View style={styles.actions}>
          <View style={styles.action}>
            <SheetButton
              label="Sync now"
              icon="refresh-cw"
              variant="secondary"
              pending={syncing}
              disabled={form.dirty || !draft.enabled || form.save.isPending}
              onPress={() => form.sync.mutate()}
            />
          </View>
          <View style={styles.action}>
            <SheetButton
              label="Save"
              pending={form.save.isPending}
              disabled={!form.dirty || form.sync.isPending}
              onPress={() => form.save.mutate()}
            />
          </View>
        </View>
      </View>
    </SettingsPage>
  );
}

function StoreRow({
  store,
  onRemove,
}: {
  store: RiftboundStore;
  onRemove: (id: string) => void;
}) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
  const removeButton = useMemo(
    () => (
      <Pressable
        onPress={() => onRemove(store.id)}
        style={({ pressed }) => [
          styles.iconButton,
          pressed && styles.iconButtonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${store.name}`}
      >
        <Feather name="x" size={16} color={theme.colors.destructive} />
      </Pressable>
    ),
    [onRemove, store.id, store.name, styles, theme.colors.destructive],
  );
  return (
    <SheetItem
      icon="map-pin"
      label={store.name}
      detail={store.address || undefined}
      trailing={removeButton}
    />
  );
}

const createStyles = (theme: ThemeTokens, skin: MailSkin) =>
  StyleSheet.create({
    footer: {
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["3"],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    actions: { flexDirection: "row", gap: theme.spacing.sm },
    action: { flex: 1 },
    iconButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.borderRadius.md,
    },
    iconButtonPressed: { backgroundColor: skin.selected },
  });
