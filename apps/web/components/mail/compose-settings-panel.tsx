"use client";

import { useState } from "react";
import { UNDO_SEND_SECONDS_OPTIONS } from "@workspace/calendar-core";
import { AlignLeft, MapPinOff, Paperclip, X } from "lucide-react";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import { useMailComposeSettings } from "@/lib/mail/compose-settings";
import {
  PaletteButton,
  PaletteField,
  PaletteSelect,
  PaletteView,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";

const SIGNATURE_POSITION_OPTIONS = [
  { value: "above_quote", label: "Above quoted text" },
  { value: "below_quote", label: "Below quoted text" },
] as const;

const UNDO_SEND_OPTIONS = UNDO_SEND_SECONDS_OPTIONS.map((option) => ({
  value: String(option.value),
  label: option.label,
}));

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

      <SettingToggleRow
        icon={MapPinOff}
        label="Remove photo location"
        description="Removes location and camera details from attached photos."
        checked={settings.stripImageMetadata}
        onToggle={() =>
          updateSettings({ stripImageMetadata: !settings.stripImageMetadata })
        }
      />

      <PaletteField
        label="Undo send"
        htmlFor="mail-undo-send"
        hint="How long a sent message waits so you can undo it. Mail sends at once when the server can't hold it."
      >
        <PaletteSelect
          id="mail-undo-send"
          label="Undo send"
          value={String(settings.undoSendSeconds)}
          options={UNDO_SEND_OPTIONS}
          onValueChange={(value) => {
            const option = UNDO_SEND_SECONDS_OPTIONS.find((entry) => String(entry.value) === value);
            if (option) updateSettings({ undoSendSeconds: option.value });
          }}
        />
      </PaletteField>

      <PaletteField
        label="Signature position"
        htmlFor="mail-signature-position"
        hint="Where your signature appears in replies and forwards"
      >
        <PaletteSelect
          id="mail-signature-position"
          label="Signature position"
          value={settings.replySignaturePosition}
          options={SIGNATURE_POSITION_OPTIONS}
          onValueChange={(replySignaturePosition) =>
            updateSettings({ replySignaturePosition })
          }
        />
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
              aria-label="Reminder keywords"
              value={newKeyword}
              onChange={(event) => setNewKeyword(event.target.value)}
              placeholder="Add keyword…"
              className={PALETTE_INPUT_CLASS}
            />
            <PaletteButton
              type="submit"
              variant="primary"
              className="h-9 shrink-0"
            >
              Add
            </PaletteButton>
          </form>
        </PaletteField>
      ) : null}
    </PaletteView>
  );
}
