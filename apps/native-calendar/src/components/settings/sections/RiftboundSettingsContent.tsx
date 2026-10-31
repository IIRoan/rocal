import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderIconButton } from "@workspace/native-core/components/layout/HeaderIconButton";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  partitionCalendarsByKind,
  type UserSettings,
} from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
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
        <SheetCenteredState loading message="Loading Riftbound settings…" />
      </SettingsPage>
    );
  if (!settings || isError)
    return (
      <SettingsPage title="Riftbound">
        <SheetMessage text="Riftbound settings could not be loaded." />
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
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);
  const { data: calendars = [] } = useSettingsCalendars();
  const form = useNativeRiftboundForm(settings.riftbound, saveSettings);
  const { draft, setDraft } = form;
  const [duration, setDuration] = useState(String(draft.durationMinutes));
  const owned = partitionCalendarsByKind(calendars).ownedCalendars;
  const canAddStore =
    !!form.eventUrl.trim() && !form.store.isPending && draft.stores.length < 10;
  return (
    <SettingsPage title="Riftbound">
      <SheetScroll>
        <SheetSection>
          <SheetGroup>
            <SheetSwitchItem
              label="Import Riftbound events"
              detail="Past 30 days and upcoming. Every 15 minutes while open. No Riot login."
              value={draft.enabled}
              onValueChange={(enabled) => setDraft({ ...draft, enabled })}
            />
            <SheetSwitchItem
              label="Only events I’m registered for"
              detail="Imported event times can let Solace match you to a public roster. Waitlists don’t count."
              value={draft.registeredOnly}
              onValueChange={(registeredOnly) =>
                setDraft({ ...draft, registeredOnly })
              }
            />
          </SheetGroup>
        </SheetSection>
        <SheetSection
          title="Riot ID"
          footer="Exact roster name, including spaces and #TAG. Kept encrypted."
        >
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
        <SheetSection
          title="Frequent stores"
          footer="Add up to 10 stores using any public event link. Only public events near each venue are available."
        >
          <SheetGroup>
            <SheetTextField
              accessibilityLabel="Play Riftbound event link"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={() => {
                if (canAddStore) form.store.mutate(form.eventUrl);
              }}
              value={form.eventUrl}
              onChangeText={form.setEventUrl}
              placeholder="Paste a Play Riftbound event link"
            />
          </SheetGroup>
          <SheetButton
            label="Add store"
            variant="secondary"
            pending={form.store.isPending}
            disabled={!canAddStore}
            onPress={() => form.store.mutate(form.eventUrl)}
          />
          {form.store.isError ? (
            <SheetMessage text="The store could not be resolved. Check the public event link and try again." />
          ) : null}
          {!draft.stores.length ? (
            <SheetMessage text="No frequent stores added." />
          ) : (
            <SheetGroup>
              {draft.stores.map((store) => (
                <View key={store.id} style={styles.storeRow}>
                  <View style={styles.storeCopy}>
                    <SheetItem label={store.name} detail={store.address} />
                  </View>
                  <HeaderIconButton
                    name="x"
                    accessibilityLabel={`Remove ${store.name}`}
                    onPress={() =>
                      setDraft({
                        ...draft,
                        stores: draft.stores.filter(
                          (item) => item.id !== store.id,
                        ),
                      })
                    }
                  />
                </View>
              ))}
            </SheetGroup>
          )}
        </SheetSection>
        <SheetSection title="Destination calendar">
          {!owned.length ? (
            <SheetMessage text="Create a calendar before enabling Riftbound." />
          ) : (
            <SheetGroup>
              {owned.map((calendar) => (
                <SheetItem
                  key={calendar.id}
                  label={calendar.name}
                  checked={draft.calendarId === calendar.id}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: draft.calendarId === calendar.id,
                  }}
                  onPress={() =>
                    setDraft({ ...draft, calendarId: calendar.id })
                  }
                />
              ))}
            </SheetGroup>
          )}
        </SheetSection>
        <SheetSection
          title="Event duration (minutes)"
          footer="Riftbound end times can be inaccurate, so imports use this duration. Existing imports are not automatically edited or deleted."
        >
          <SheetGroup>
            <SheetTextField
              accessibilityLabel="Event duration in minutes"
              keyboardType="number-pad"
              value={duration}
              onChangeText={(value) => {
                setDuration(value);
                setDraft({ ...draft, durationMinutes: Number(value) });
              }}
            />
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, theme.spacing["3"]) },
        ]}
      >
        {form.save.isError ? (
          <SheetMessage tone="destructive" text={form.save.error.message} />
        ) : form.save.isSuccess && !form.dirty ? (
          <SheetMessage text="Settings saved." />
        ) : null}
        {form.sync.data?.failedEvents ? (
          <SheetMessage
            tone="destructive"
            text="Some events could not be imported. Sync again to retry."
          />
        ) : null}
        {form.sync.isError || form.backgroundError ? (
          <SheetMessage
            tone="destructive"
            text="Riftbound could not be synced. Try again; existing events were not removed."
          />
        ) : form.sync.data ? (
          <SheetMessage
            text={`${form.sync.data.events.length} matching events; ${form.sync.data.eventsCreated} newly added.`}
          />
        ) : null}
        <View style={styles.actions}>
          <View style={styles.action}>
            <SheetButton
              label="Save settings"
              pending={form.save.isPending}
              disabled={form.sync.isPending}
              onPress={() => form.save.mutate()}
            />
          </View>
          <View style={styles.action}>
            <SheetButton
              label="Sync now"
              variant="secondary"
              pending={form.sync.isPending || form.backgroundPending}
              disabled={form.dirty || !draft.enabled || form.save.isPending}
              onPress={() => form.sync.mutate()}
            />
          </View>
        </View>
      </View>
    </SettingsPage>
  );
}

const createStyles = (theme: ThemeTokens) =>
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
    storeRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingRight: theme.spacing["2"],
    },
    storeCopy: { flex: 1, minWidth: 0 },
  });
