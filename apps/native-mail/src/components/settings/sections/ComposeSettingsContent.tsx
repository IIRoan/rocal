import React, { useState } from "react";
import {
  addAttachmentReminderKeyword,
  type MailSignaturePosition,
} from "@workspace/calendar-core";
import { SettingsPage } from "@workspace/native-core/components/settings/SettingsPage";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
  SheetSwitchItem,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useMailComposeSettings } from "../../../hooks/use-mail-settings";

const SIGNATURE_POSITIONS: readonly { value: MailSignaturePosition; label: string }[] = [
  { value: "above_quote", label: "Above quoted text" },
  { value: "below_quote", label: "Below quoted text" },
];

export function ComposeSettingsContent() {
  const { settings, isLoaded, updateSettings } = useMailComposeSettings();
  const [newKeyword, setNewKeyword] = useState("");

  if (!isLoaded) {
    return (
      <SettingsPage title="Composing">
        <SheetCenteredState loading message="Loading settings…" />
      </SettingsPage>
    );
  }

  const saveKeyword = () => {
    if (!newKeyword.trim()) return;
    updateSettings({
      attachmentReminderKeywords: addAttachmentReminderKeyword(
        settings.attachmentReminderKeywords,
        newKeyword,
      ),
    });
    setNewKeyword("");
  };

  const removeKeyword = (keyword: string) =>
    updateSettings({
      attachmentReminderKeywords: settings.attachmentReminderKeywords.filter(
        (entry) => entry !== keyword,
      ),
    });

  return (
    <SettingsPage title="Composing">
      <SheetScroll>
        <SheetSection>
          <SheetGroup>
            <SheetSwitchItem
              label="Auto-select reply identity"
              detail="Use the identity that matches the address you are replying from"
              value={settings.autoSelectReplyIdentity}
              onValueChange={(value) => updateSettings({ autoSelectReplyIdentity: value })}
            />
            <SheetSwitchItem
              label="Plain text only"
              detail="Compose and send without rich formatting"
              value={settings.plainTextMode}
              onValueChange={(value) => updateSettings({ plainTextMode: value })}
            />
          </SheetGroup>
        </SheetSection>

        <SheetSection
          title="Signature position"
          footer="Where your signature appears in replies and forwards."
        >
          <SheetGroup>
            {SIGNATURE_POSITIONS.map((option) => (
              <SheetItem
                key={option.value}
                label={option.label}
                checked={settings.signaturePosition === option.value}
                onPress={() => updateSettings({ signaturePosition: option.value })}
                accessibilityRole="radio"
                accessibilityState={{ checked: settings.signaturePosition === option.value }}
              />
            ))}
          </SheetGroup>
        </SheetSection>

        <SheetSection>
          <SheetGroup>
            <SheetSwitchItem
              label="Signature separator"
              detail={'Insert "--" before the signature block'}
              value={settings.signatureSeparatorEnabled}
              onValueChange={(value) => updateSettings({ signatureSeparatorEnabled: value })}
            />
            <SheetSwitchItem
              label="Attachment reminder"
              detail="Warn when you mention attachments but none are added"
              value={settings.attachmentReminderEnabled}
              onValueChange={(value) => updateSettings({ attachmentReminderEnabled: value })}
            />
          </SheetGroup>
        </SheetSection>

        {settings.attachmentReminderEnabled ? (
          <SheetSection
            title="Reminder keywords"
            footer="Checked in subject and body before sending."
          >
            <SheetGroup>
              {settings.attachmentReminderKeywords.map((keyword) => (
                <SheetItem
                  key={keyword}
                  label={keyword}
                  accessory="x"
                  onPress={() => removeKeyword(keyword)}
                  accessibilityLabel={`Remove ${keyword}`}
                />
              ))}
              <SheetTextField
                value={newKeyword}
                onChangeText={setNewKeyword}
                placeholder="Add keyword…"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={saveKeyword}
                accessibilityLabel="Add attachment reminder keyword"
              />
            </SheetGroup>
            <SheetButton
              label="Add keyword"
              variant="secondary"
              icon="plus"
              onPress={saveKeyword}
              disabled={!newKeyword.trim()}
            />
          </SheetSection>
        ) : null}
      </SheetScroll>
    </SettingsPage>
  );
}
