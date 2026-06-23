"use client";

import { useState } from "react";
import { ArrowLeft, AlignLeft, Paperclip, X } from "lucide-react";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import {
  useMailComposeSettings,
  type MailSignaturePosition,
} from "@/lib/mail/compose-settings";

export function ComposeSettingsPanel({ goBack }: { goBack: () => void }) {
  const { settings, updateSettings } = useMailComposeSettings();
  const [newKeyword, setNewKeyword] = useState("");

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
        <span className="text-sm font-medium">Composing</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <SettingToggleRow
          icon={AlignLeft}
          label="Auto-select reply identity"
          description="Use the identity that matches the address you are replying from"
          checked={settings.autoSelectReplyIdentity}
          onToggle={() =>
            updateSettings({
              autoSelectReplyIdentity: !settings.autoSelectReplyIdentity,
            })
          }
        />

        <SettingToggleRow
          icon={AlignLeft}
          label="Plain text only"
          description="Compose and send without rich formatting"
          checked={settings.plainTextMode}
          onToggle={() =>
            updateSettings({ plainTextMode: !settings.plainTextMode })
          }
        />

        <div className="px-3 py-3 border-t border-border/40">
          <label className="text-sm font-medium">Signature position</label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            Where your signature appears in replies and forwards
          </p>
          <select
            value={settings.signaturePosition}
            onChange={(event) =>
              updateSettings({
                signaturePosition: event.target
                  .value as MailSignaturePosition,
              })
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="above_quote">Above quoted text</option>
            <option value="below_quote">Below quoted text</option>
          </select>
        </div>

        <SettingToggleRow
          icon={AlignLeft}
          label="Signature separator"
          description='Insert "--" before the signature block'
          checked={settings.signatureSeparatorEnabled}
          onToggle={() =>
            updateSettings({
              signatureSeparatorEnabled: !settings.signatureSeparatorEnabled,
            })
          }
        />

        <SettingToggleRow
          icon={Paperclip}
          label="Attachment reminder"
          description='Warn when you mention attachments but none are added'
          checked={settings.attachmentReminderEnabled}
          onToggle={() =>
            updateSettings({
              attachmentReminderEnabled: !settings.attachmentReminderEnabled,
            })
          }
        />

        {settings.attachmentReminderEnabled ? (
          <div className="px-3 py-3 border-t border-border/40 space-y-2">
            <div>
              <div className="text-sm font-medium">Reminder keywords</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Checked in subject and body before sending
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {settings.attachmentReminderKeywords.map((keyword) => (
                <span
                  key={keyword}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
                >
                  {keyword}
                  <button
                    type="button"
                    aria-label={`Remove ${keyword}`}
                    onClick={() =>
                      updateSettings({
                        attachmentReminderKeywords:
                          settings.attachmentReminderKeywords.filter(
                            (entry) => entry !== keyword,
                          ),
                      })
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = newKeyword.trim().toLowerCase();
                if (
                  trimmed &&
                  !settings.attachmentReminderKeywords.includes(trimmed)
                ) {
                  updateSettings({
                    attachmentReminderKeywords: [
                      ...settings.attachmentReminderKeywords,
                      trimmed,
                    ],
                  });
                }
                setNewKeyword("");
              }}
            >
              <Input
                value={newKeyword}
                onChange={(event) => setNewKeyword(event.target.value)}
                placeholder="Add keyword…"
                className="h-8 text-sm"
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={!newKeyword.trim()}
              >
                Add
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
