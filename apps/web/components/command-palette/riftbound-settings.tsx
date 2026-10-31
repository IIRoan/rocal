"use client";

import {
  CalendarDays,
  CalendarPlus,
  Clock,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  UserCheck,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import {
  partitionCalendarsByKind,
  type UserSettings,
} from "@workspace/calendar-core";
import {
  RIFTBOUND_SETTINGS_COPY as COPY,
  riftboundDurationOptions,
} from "@workspace/calendar-core/riftbound-settings";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useSettings } from "@/hooks/use-settings";
import { useWebRiftboundForm } from "@/hooks/use-riftbound";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteIconBox,
  PaletteSection,
  PaletteSelectRow,
  PaletteView,
} from "./palette-ui";
import {
  PALETTE_COMPACT_SELECT_CLASS,
  PALETTE_INPUT_CLASS,
} from "./palette-styles";
import { SettingToggleRow } from "./setting-toggle-row";

export function RiftboundSettings({ goBack }: { goBack: () => void }) {
  const { settings, loading, error, updateSettings } = useSettings();
  if (loading)
    return (
      <PaletteView title="Riftbound" onBack={goBack}>
        <output
          aria-label="Loading Riftbound settings"
          className="flex items-center justify-center py-8"
        >
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </output>
      </PaletteView>
    );
  if (!settings || error)
    return (
      <PaletteView title="Riftbound" onBack={goBack}>
        <PaletteEmptyState>
          <span role="alert">Riftbound settings could not be loaded.</span>
        </PaletteEmptyState>
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
  const owned = partitionCalendarsByKind(calendars ?? []).ownedCalendars;
  const syncing = form.sync.isPending || form.backgroundPending;
  const canAddStore =
    !!form.eventUrl.trim() && !form.store.isPending && draft.stores.length < 10;
  return (
    <PaletteView
      title="Riftbound"
      onBack={goBack}
      footer={
        <div className="flex items-center gap-2">
          <p
            role={form.status?.tone === "error" ? "alert" : "status"}
            className={cn(
              "min-w-0 flex-1 text-[13px] leading-[130%]",
              form.status?.tone === "error"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {form.status?.text}
          </p>
          <PaletteButton
            loading={syncing}
            disabled={form.dirty || !draft.enabled || form.save.isPending}
            onClick={() => form.sync.mutate()}
          >
            {syncing ? null : <RefreshCw className="size-3.5" />}
            Sync now
          </PaletteButton>
          <PaletteButton
            variant="primary"
            loading={form.save.isPending}
            disabled={!form.dirty || form.sync.isPending}
            onClick={() => form.save.mutate()}
          >
            Save
          </PaletteButton>
        </div>
      }
    >
      <PaletteSection>
        <SettingToggleRow
          icon={CalendarPlus}
          label={COPY.importLabel}
          description={COPY.importDescription}
          checked={draft.enabled}
          onToggle={() => setDraft({ ...draft, enabled: !draft.enabled })}
        />
        <SettingToggleRow
          icon={UserCheck}
          label={COPY.registeredLabel}
          description={COPY.registeredDescription}
          checked={draft.registeredOnly}
          onToggle={() =>
            setDraft({ ...draft, registeredOnly: !draft.registeredOnly })
          }
        />
        <p className="px-2 pt-1 pb-2 text-[13px] leading-[130%] text-muted-foreground">
          {COPY.registeredNote}
        </p>
      </PaletteSection>
      {draft.registeredOnly ? (
        <PaletteSection label="Riot ID">
          <p className="px-2 pb-1 text-[13px] leading-[130%] text-muted-foreground">
            {COPY.riotIdHint}
          </p>
          <div className="px-2 pt-1 pb-2">
            <input
              id="riftbound-riot-id"
              aria-label="Riot ID"
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
          </div>
        </PaletteSection>
      ) : null}
      <PaletteSection label="Frequent Stores">
        <p className="px-2 pb-1 text-[13px] leading-[130%] text-muted-foreground">
          {COPY.storesHint}
        </p>
        <form
          className="flex min-w-0 items-center gap-2 px-2 pt-1 pb-2"
          action={() => {
            if (canAddStore) form.store.mutate(form.eventUrl);
          }}
        >
          <input
            id="riftbound-store-link"
            aria-label="Play Riftbound event link"
            className={PALETTE_INPUT_CLASS}
            value={form.eventUrl}
            onChange={(event) => form.setEventUrl(event.target.value)}
            placeholder="Paste a Play Riftbound event link"
            type="url"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <PaletteButton
            type="submit"
            variant="primary"
            className="h-11 md:h-9"
            loading={form.store.isPending}
            disabled={!canAddStore}
          >
            {form.store.isPending ? null : <Plus className="size-4" />}
            Add
          </PaletteButton>
        </form>
        {form.store.isError ? (
          <p
            role="alert"
            className="px-2 pb-2 text-[13px] leading-[130%] text-destructive"
          >
            {COPY.storeError}
          </p>
        ) : null}
        {draft.stores.length ? (
          draft.stores.map((store) => (
            <div key={store.id} className="flex items-center gap-3 p-2">
              <PaletteIconBox>
                <MapPin className="size-4" />
              </PaletteIconBox>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] leading-[130%] text-foreground">
                  {store.name}
                </p>
                {store.address ? (
                  <p className="truncate text-[13px] leading-[130%] text-muted-foreground">
                    {store.address}
                  </p>
                ) : null}
              </div>
              <SimpleTooltip content="Remove store">
                <button
                  type="button"
                  aria-label={`Remove ${store.name}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      stores: draft.stores.filter(
                        (item) => item.id !== store.id,
                      ),
                    })
                  }
                  className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/25 md:size-8"
                >
                  <X className="size-4" />
                </button>
              </SimpleTooltip>
            </div>
          ))
        ) : (
          <PaletteEmptyState>{COPY.noStores}</PaletteEmptyState>
        )}
      </PaletteSection>
      <PaletteSection label="Calendar">
        <PaletteSelectRow icon={CalendarDays} label="Destination calendar">
          <Select
            value={draft.calendarId}
            disabled={!owned.length}
            onValueChange={(calendarId) => setDraft({ ...draft, calendarId })}
          >
            <SelectTrigger
              id="riftbound-calendar"
              aria-label="Destination calendar"
              className={`w-[140px] ${PALETTE_COMPACT_SELECT_CLASS}`}
            >
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {owned.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PaletteSelectRow>
        <PaletteSelectRow icon={Clock} label="Event length">
          <Select
            value={String(draft.durationMinutes)}
            onValueChange={(value) =>
              setDraft({ ...draft, durationMinutes: Number(value) })
            }
          >
            <SelectTrigger
              id="riftbound-duration"
              aria-label="Event length"
              className={`w-[140px] ${PALETTE_COMPACT_SELECT_CLASS}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {riftboundDurationOptions(draft.durationMinutes).map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PaletteSelectRow>
        <p className="px-2 pt-1 pb-2 text-[13px] leading-[130%] text-muted-foreground">
          {owned.length
            ? COPY.durationHint
            : `${COPY.noCalendars} ${COPY.durationHint}`}
        </p>
      </PaletteSection>
    </PaletteView>
  );
}
