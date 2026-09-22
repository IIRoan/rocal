"use client";

import { Keyboard, ListFilter } from "lucide-react";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import {
  useMailListSettings,
  type ListDensity,
  type MarkAsReadDelay,
} from "@/lib/mail/mail-list-settings";
import { getMailShortcutHelpItems } from "@/hooks/use-mail-keyboard-shortcuts";
import {
  PaletteField,
  PaletteSection,
  PaletteSectionLabel,
  PaletteView,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";

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
          <select
            id="mail-row-density"
            value={settings.density}
            onChange={(event) =>
              updateSettings({ density: event.target.value as ListDensity })
            }
            className={PALETTE_INPUT_CLASS}
          >
            <option value="compact">Compact (more messages per screen)</option>
            <option value="comfortable">Comfortable (more breathing room)</option>
          </select>
        </PaletteField>

        <SettingToggleRow
          icon={ListFilter}
          label="Show label chips in list"
          description="Display colored label tags on each message row"
          checked={settings.showLabelChipsInList}
          onToggle={() =>
            updateSettings({ showLabelChipsInList: !settings.showLabelChipsInList })
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
          <select
            id="mail-mark-as-read-delay"
            value={settings.markAsReadDelay}
            onChange={(event) =>
              updateSettings({
                markAsReadDelay: event.target.value as MarkAsReadDelay,
              })
            }
            className={PALETTE_INPUT_CLASS}
          >
            <option value="instant">Instantly</option>
            <option value="delayed">After 3 seconds</option>
            <option value="never">Never (manual only)</option>
          </select>
        </PaletteField>
      </PaletteSection>

      <PaletteSection label="Actions">
        <PaletteField
          label="Undo toast duration"
          htmlFor="mail-undo-toast-duration"
          hint="How long the undo button stays after deleting or archiving"
        >
          <select
            id="mail-undo-toast-duration"
            value={String(settings.undoToastDurationMs)}
            onChange={(event) =>
              updateSettings({
                undoToastDurationMs: Number(event.target.value),
              })
            }
            className={PALETTE_INPUT_CLASS}
          >
            <option value="3000">3 seconds</option>
            <option value="5000">5 seconds</option>
            <option value="10000">10 seconds</option>
            <option value="15000">15 seconds</option>
          </select>
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
                  <kbd className={KEY_CAP_CLASS}>{key === " " ? "Space" : key}</kbd>
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
