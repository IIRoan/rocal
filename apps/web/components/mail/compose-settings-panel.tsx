"use client";

import { useState } from "react";
import { AlignLeft, Paperclip, X } from "lucide-react";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import {
  useMailComposeSettings,
  type MailSignaturePosition,
} from "@/lib/mail/compose-settings";
import {
  PaletteButton,
  PaletteField,
  PaletteView,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";

export function ComposeSettingsPanel({ goBack }: { goBack: () => void }) {
  const { settings, updateSettings } = useMailComposeSettings();
  const [newKeyword, setNewKeyword] = useState("");

  return (
    <PaletteView title="Composing" onBack={goBack}>
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

      <PaletteField
        label="Signature position"
        htmlFor="mail-signature-position"
        hint="Where your signature appears in replies and forwards"
      >
        <select
          id="mail-signature-position"
          value={settings.signaturePosition}
          onChange={(event) =>
            updateSettings({
              signaturePosition: event.target.value as MailSignaturePosition,
            })
          }
          className={PALETTE_INPUT_CLASS}
        >
          <option value="above_quote">Above quoted text</option>
          <option value="below_quote">Below quoted text</option>
        </select>
      </PaletteField>

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
        description="Warn when you mention attachments but none are added"
        checked={settings.attachmentReminderEnabled}
        onToggle={() =>
          updateSettings({
            attachmentReminderEnabled: !settings.attachmentReminderEnabled,
          })
        }
      />

      {settings.attachmentReminderEnabled ? (
        <PaletteField
          label="Reminder keywords"
          htmlFor="mail-reminder-keyword"
          hint="Checked in subject and body before sending"
        >
          <div className="flex flex-wrap gap-1.5">
            {settings.attachmentReminderKeywords.map((keyword) => (
              <span
                key={keyword}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[13px] text-foreground"
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
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            className="flex gap-2"
            action={() => {
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
            <input
              id="mail-reminder-keyword"
              aria-label="Add attachment reminder keyword"
              value={newKeyword}
              onChange={(event) => setNewKeyword(event.target.value)}
              placeholder="Add keyword…"
              className={PALETTE_INPUT_CLASS}
            />
            <PaletteButton
              type="submit"
              variant="primary"
              className="h-9 shrink-0"
              disabled={!newKeyword.trim()}
            >
              Add
            </PaletteButton>
          </form>
        </PaletteField>
      ) : null}
    </PaletteView>
  );
}
