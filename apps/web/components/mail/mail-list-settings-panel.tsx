"use client";

import { ArrowLeft, Keyboard, ListFilter, Undo2 } from "lucide-react";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import {
  useMailListSettings,
  type ListDensity,
  type MarkAsReadDelay,
} from "@/lib/mail/mail-list-settings";
import { getMailShortcutHelpItems } from "@/hooks/use-mail-keyboard-shortcuts";

export function MailListSettingsPanel({ goBack }: { goBack: () => void }) {
  const { settings, updateSettings } = useMailListSettings();
  const shortcuts = getMailShortcutHelpItems();

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
    >
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={goBack}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">List &amp; shortcuts</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="px-3 py-2">
          <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            List density
          </div>
        </div>

        <div className="px-3 py-3 border-t border-border/40">
          <label className="text-sm font-medium">Row density</label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            How much space each message row takes in the list
          </p>
          <select
            value={settings.density}
            onChange={(event) =>
              updateSettings({ density: event.target.value as ListDensity })
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="compact">Compact (more messages per screen)</option>
            <option value="comfortable">Comfortable (more breathing room)</option>
          </select>
        </div>

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

        <div className="px-3 py-2 mt-2 border-t border-border/40">
          <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Reading
          </div>
        </div>

        <div className="px-3 py-3 border-t border-border/40">
          <label className="text-sm font-medium">Mark as read delay</label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            When a message is opened, how long before it&apos;s marked as read
          </p>
          <select
            value={settings.markAsReadDelay}
            onChange={(event) =>
              updateSettings({
                markAsReadDelay: event.target.value as MarkAsReadDelay,
              })
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="instant">Instantly</option>
            <option value="delayed">After 3 seconds</option>
            <option value="never">Never (manual only)</option>
          </select>
        </div>

        <div className="px-3 py-2 mt-2 border-t border-border/40">
          <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Actions
          </div>
        </div>

        <div className="px-3 py-3 border-t border-border/40">
          <label className="text-sm font-medium">Undo toast duration</label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            How long the undo button stays after deleting or archiving
          </p>
          <select
            value={String(settings.undoToastDurationMs)}
            onChange={(event) =>
              updateSettings({
                undoToastDurationMs: Number(event.target.value),
              })
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="3000">3 seconds</option>
            <option value="5000">5 seconds</option>
            <option value="10000">10 seconds</option>
            <option value="15000">15 seconds</option>
          </select>
        </div>

        <div className="px-3 py-2 mt-2 border-t border-border/40">
          <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Keyboard
          </div>
        </div>

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
          <div className="px-3 py-3 border-t border-border/40">
            <div className="text-xs text-muted-foreground mb-2">
              Available shortcuts
            </div>
            <div className="space-y-1">
              {shortcuts.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-foreground/70">{label}</span>
                  <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {key === " " ? "Space" : key}
                  </kbd>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-foreground/70">Show this help</span>
                <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  ?
                </kbd>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
