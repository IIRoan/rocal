"use client";

import { Keyboard, ListFilter } from "lucide-react";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import { useMailListSettings } from "@/lib/mail/mail-list-settings";
import { getMailShortcutHelpItems } from "@/hooks/use-mail-keyboard-shortcuts";
import {
  PaletteField,
  PaletteSection,
  PaletteSectionLabel,
  PaletteSelect,
  PaletteView,
} from "../command-palette/palette-ui";

const DENSITY_OPTIONS = [
  { value: "compact", label: "Compact (more messages per screen)" },
  { value: "comfortable", label: "Comfortable (more breathing room)" },
] as const;

const MARK_AS_READ_OPTIONS = [
  { value: "instant", label: "Instantly" },
  { value: "delayed", label: "After 3 seconds" },
  { value: "never", label: "Never (manual only)" },
] as const;

const UNDO_DURATION_OPTIONS = [
  { value: "3000", label: "3 seconds" },
  { value: "5000", label: "5 seconds" },
  { value: "10000", label: "10 seconds" },
  { value: "15000", label: "15 seconds" },
] as const;

const KEY_CAP_CLASS =
  "rounded bg-muted px-1.5 font-mono text-[11px] text-muted-foreground";

export function MailListSettingsPanel({ goBack }: { goBack: () => void }) {
  const { settings, updateSettings } = useMailListSettings();
  const shortcuts = getMailShortcutHelpItems();

  return (
    <PaletteView title="List & shortcuts" onBack={goBack}>
      <PaletteSection label="List density">
        <PaletteField
          label="Row density"
          htmlFor="mail-row-density"
          hint="How much space each message row takes in the list"
        >
          <PaletteSelect
            id="mail-row-density"
            label="Row density"
            value={settings.density}
            options={DENSITY_OPTIONS}
            onValueChange={(density) => updateSettings({ density })}
          />
        </PaletteField>

        <SettingToggleRow
          icon={ListFilter}
          label="Show label chips in list"
          description="Display colored label tags on each message row"
          checked={settings.showLabelChipsInList}
          onToggle={() =>
            updateSettings({
              showLabelChipsInList: !settings.showLabelChipsInList,
            })
          }
        />

        <SettingToggleRow
          icon={ListFilter}
          label="Thread expand in list"
          description="Allow expanding threads inline to see all messages"
          checked={settings.threadExpandInList}
          onToggle={() =>
            updateSettings({ threadExpandInList: !settings.threadExpandInList })
          }
        />
      </PaletteSection>

      <PaletteSection label="Reading">
        <PaletteField
          label="Mark as read delay"
          htmlFor="mail-mark-as-read-delay"
          hint="When a message is opened, how long before it's marked as read"
        >
          <PaletteSelect
            id="mail-mark-as-read-delay"
            label="Mark as read delay"
            value={settings.markAsReadDelay}
            options={MARK_AS_READ_OPTIONS}
            onValueChange={(markAsReadDelay) =>
              updateSettings({ markAsReadDelay })
            }
          />
        </PaletteField>
      </PaletteSection>

      <PaletteSection label="Actions">
        <PaletteField
          label="Undo toast duration"
          htmlFor="mail-undo-toast-duration"
          hint="How long the undo button stays after deleting or archiving"
        >
          <PaletteSelect
            id="mail-undo-toast-duration"
            label="Undo toast duration"
            value={String(settings.undoToastDurationMs)}
            options={UNDO_DURATION_OPTIONS}
            onValueChange={(value) =>
              updateSettings({ undoToastDurationMs: Number(value) })
            }
          />
        </PaletteField>
      </PaletteSection>

      <PaletteSection label="Keyboard">
        <SettingToggleRow
          icon={Keyboard}
          label="Keyboard shortcuts"
          description="Enable j/k, r, e, s, and other mail shortcuts"
          checked={settings.keyboardShortcutsEnabled}
          onToggle={() =>
            updateSettings({
              keyboardShortcutsEnabled: !settings.keyboardShortcutsEnabled,
            })
          }
        />

        {settings.keyboardShortcutsEnabled && (
          <>
            <PaletteSectionLabel>Available shortcuts</PaletteSectionLabel>
            <div className="flex flex-col gap-1 p-2">
              {shortcuts.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between text-[13px]"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <kbd className={KEY_CAP_CLASS}>
                    {key === " " ? "Space" : key}
                  </kbd>
                </div>
              ))}
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">Show this help</span>
                <kbd className={KEY_CAP_CLASS}>?</kbd>
              </div>
            </div>
          </>
        )}
      </PaletteSection>
    </PaletteView>
  );
}
