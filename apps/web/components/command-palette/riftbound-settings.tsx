"use client";

import { useState } from "react";
import { Calendar, Check, Gamepad2, X } from "lucide-react";
import { Input } from "@workspace/ui/components/ui/input";
import {
  partitionCalendarsByKind,
  type UserSettings,
} from "@workspace/calendar-core";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useSettings } from "@/hooks/use-settings";
import { useWebRiftboundForm } from "@/hooks/use-riftbound";
import {
  PaletteButton,
  PaletteField,
  PaletteSection,
  PaletteSelect,
  PaletteView,
} from "./palette-ui";
import { PALETTE_INPUT_CLASS } from "./palette-styles";
import { SettingToggleRow } from "./setting-toggle-row";

export function RiftboundSettings({ goBack }: { goBack: () => void }) {
  const { settings, loading, error, updateSettings } = useSettings();
  if (loading)
    return (
      <PaletteView title="Riftbound" onBack={goBack}>
        <p role="status" className="p-3 text-muted-foreground">
          Loading Riftbound settings…
        </p>
      </PaletteView>
    );
  if (!settings || error)
    return (
      <PaletteView title="Riftbound" onBack={goBack}>
        <p role="alert" className="p-3 text-destructive">
          Riftbound settings could not be loaded.
        </p>
      </PaletteView>
    );
  return (
    <RiftboundForm
      key={settings.userId}
      settings={settings}
      goBack={goBack}
      saveSettings={updateSettings}
    />
  );
}

function RiftboundForm({
  settings,
  goBack,
  saveSettings,
}: {
  settings: UserSettings;
  goBack: () => void;
  saveSettings: ReturnType<typeof useSettings>["updateSettings"];
}) {
  const { calendars } = useSharedCalendarData();
  const form = useWebRiftboundForm(settings.riftbound, (riftbound, isCurrent) =>
    saveSettings({ riftbound }, isCurrent),
  );
  const { draft, setDraft } = form;
  const [duration, setDuration] = useState(String(draft.durationMinutes));
  const owned = partitionCalendarsByKind(calendars ?? []).ownedCalendars;
  const syncing = form.sync.isPending || form.backgroundPending;
  const canAddStore =
    !!form.eventUrl.trim() && !form.store.isPending && draft.stores.length < 10;
  return (
    <PaletteView
      title="Riftbound"
      onBack={goBack}
      footer={
        <div className="space-y-2">
          <div
            className="space-y-1 text-[13px] leading-snug"
            aria-live="polite"
          >
            {form.sync.data?.failedEvents ? (
              <p role="alert" className="text-destructive">
                Some events could not be imported. Sync again to retry.
              </p>
            ) : null}
            {form.save.isError ? (
              <p role="alert" className="text-destructive">
                {form.save.error.message}
              </p>
            ) : form.save.isSuccess && !form.dirty ? (
              <p className="text-muted-foreground">Settings saved.</p>
            ) : null}
            {form.sync.isError || form.backgroundError ? (
              <p role="alert" className="text-destructive">
                Riftbound could not be synced. Try again; existing events were
                not removed.
              </p>
            ) : form.sync.data ? (
              <p className="text-muted-foreground tabular-nums">
                {form.sync.data.events.length} matching events;{" "}
                {form.sync.data.eventsCreated} newly added.
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PaletteButton
              variant="primary"
              className="h-11"
              loading={form.save.isPending}
              disabled={form.sync.isPending}
              onClick={() => form.save.mutate()}
            >
              {form.save.isPending ? "Saving…" : "Save settings"}
            </PaletteButton>
            <PaletteButton
              className="h-11"
              loading={syncing}
              disabled={form.dirty || !draft.enabled || form.save.isPending}
              onClick={() => form.sync.mutate()}
            >
              {!syncing ? <Calendar className="size-4" /> : null}
              {syncing ? "Syncing…" : "Sync now"}
            </PaletteButton>
          </div>
        </div>
      }
    >
      <PaletteSection>
        <SettingToggleRow
          icon={Gamepad2}
          label="Import Riftbound events"
          description="Past 30 days and upcoming. Every 15 minutes while open. No Riot login."
          checked={draft.enabled}
          onToggle={() => setDraft({ ...draft, enabled: !draft.enabled })}
        />
        <SettingToggleRow
          icon={Check}
          label="Only events I’m registered for"
          description="Imported event times can let Solace match you to a public roster. Waitlists don’t count."
          checked={draft.registeredOnly}
          onToggle={() =>
            setDraft({ ...draft, registeredOnly: !draft.registeredOnly })
          }
        />
      </PaletteSection>
      <PaletteField
        label="Riot ID"
        htmlFor="riftbound-riot-id"
        hint="Exact roster name, including spaces and #TAG. Kept encrypted."
      >
        <Input
          id="riftbound-riot-id"
          className={PALETTE_INPUT_CLASS}
          value={draft.riotId}
          maxLength={100}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Player Name#TAG"
          onChange={(event) =>
            setDraft({ ...draft, riotId: event.target.value })
          }
        />
      </PaletteField>
      <PaletteSection label="Frequent stores">
        <PaletteField
          label="Play Riftbound event link"
          htmlFor="riftbound-store-link"
          hint="Add up to 10 stores. Only public events near each venue are available."
        >
          <form
            className="flex min-w-0 items-center gap-2"
            action={() => {
              if (canAddStore) form.store.mutate(form.eventUrl);
            }}
          >
            <Input
              id="riftbound-store-link"
              className={PALETTE_INPUT_CLASS}
              value={form.eventUrl}
              onChange={(event) => form.setEventUrl(event.target.value)}
              placeholder="Paste an event link"
              type="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <PaletteButton
              type="submit"
              className="h-11 md:h-9"
              loading={form.store.isPending}
              disabled={!canAddStore}
            >
              {form.store.isPending ? "Finding…" : "Add store"}
            </PaletteButton>
          </form>
        </PaletteField>
        {form.store.isError ? (
          <p role="alert" className="px-2 pb-2 text-[13px] text-destructive">
            The store could not be resolved. Check the public event link and try
            again.
          </p>
        ) : null}
        {!draft.stores.length ? (
          <p className="px-2 pb-2 text-[13px] text-muted-foreground">
            No frequent stores added.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 px-2">
            {draft.stores.map((store) => (
              <li
                key={store.id}
                className="flex min-w-0 items-center gap-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] leading-snug">
                    {store.name}
                  </p>
                  <p className="break-words text-[13px] leading-snug text-muted-foreground">
                    {store.address}
                  </p>
                </div>
                <PaletteButton
                  variant="ghost"
                  className="size-11 p-0"
                  aria-label={`Remove ${store.name}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      stores: draft.stores.filter(
                        (item) => item.id !== store.id,
                      ),
                    })
                  }
                >
                  <X className="size-4" />
                </PaletteButton>
              </li>
            ))}
          </ul>
        )}
      </PaletteSection>
      <PaletteSection label="Calendar">
        <div className="grid min-w-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_8rem]">
          <PaletteField
            label="Destination calendar"
            htmlFor="riftbound-calendar"
          >
            <PaletteSelect
              id="riftbound-calendar"
              label="Destination calendar"
              value={draft.calendarId}
              placeholder="Choose a calendar"
              options={owned.map((calendar) => ({
                value: calendar.id,
                label: calendar.name,
              }))}
              onValueChange={(calendarId) => setDraft({ ...draft, calendarId })}
            />
          </PaletteField>
          <PaletteField label="Duration (minutes)" htmlFor="riftbound-duration">
            <Input
              id="riftbound-duration"
              className={PALETTE_INPUT_CLASS}
              inputMode="numeric"
              value={duration}
              onChange={(event) => {
                setDuration(event.target.value);
                setDraft({
                  ...draft,
                  durationMinutes: Number(event.target.value),
                });
              }}
            />
          </PaletteField>
        </div>
        {!owned.length ? (
          <p className="px-2 text-[13px] text-muted-foreground">
            Create a calendar before enabling Riftbound.
          </p>
        ) : null}
        <p className="px-2 pb-2 text-[13px] leading-snug text-muted-foreground">
          Riftbound end times can be inaccurate, so imports use this duration.
          Existing imports are not automatically edited or deleted.
        </p>
      </PaletteSection>
    </PaletteView>
  );
}
