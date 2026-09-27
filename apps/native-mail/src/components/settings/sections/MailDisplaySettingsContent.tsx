import React, { useState } from "react";
import { Alert } from "react-native";
import {
  EMAIL_APPEARANCES,
  EXTERNAL_CONTENT_POLICIES,
  TRUSTED_SENDER_DESCRIPTION,
  normalizeEmailAddress,
  type EmailAppearance,
  type ExternalContentPolicy,
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
import { useMailDisplaySettings } from "../../../hooks/use-mail-settings";

const POLICY_LABELS: Record<ExternalContentPolicy, string> = {
  ask: "Ask before loading",
  block: "Always block",
  allow: "Always allow",
};

const APPEARANCE_LABELS: Record<EmailAppearance, string> = {
  dark: "Dark (adapt colors)",
  light: "Light",
  original: "Original (as sent)",
};

export function MailDisplaySettingsContent() {
  const { settings, isLoaded, updateSettings, addTrustedSender, removeTrustedSender } =
    useMailDisplaySettings();
  const [newSender, setNewSender] = useState("");

  if (!isLoaded) {
    return (
      <SettingsPage title="Content & display">
        <SheetCenteredState loading message="Loading settings…" />
      </SettingsPage>
    );
  }

  const normalizedNewSender = normalizeEmailAddress(newSender);
  const canAddSender = normalizedNewSender.includes("@");

  const saveSender = () => {
    if (!canAddSender) return;
    addTrustedSender(normalizedNewSender);
    setNewSender("");
  };

  const confirmRemoveSender = (email: string) => {
    Alert.alert("Remove trusted sender", `Stop loading remote images from ${email} automatically?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeTrustedSender(email) },
    ]);
  };

  return (
    <SettingsPage title="Content & display">
      <SheetScroll>
        <SheetSection
          title="Remote images"
          footer="How to handle images and other remote content in email bodies."
        >
          <SheetGroup>
            {EXTERNAL_CONTENT_POLICIES.map((policy) => (
              <SheetItem
                key={policy}
                label={POLICY_LABELS[policy]}
                checked={settings.externalContentPolicy === policy}
                onPress={() => updateSettings({ externalContentPolicy: policy })}
                accessibilityRole="radio"
                accessibilityState={{ checked: settings.externalContentPolicy === policy }}
              />
            ))}
          </SheetGroup>
        </SheetSection>

        <SheetSection title="Trusted senders" footer={TRUSTED_SENDER_DESCRIPTION}>
          <SheetGroup>
            {settings.trustedSenders.length === 0 ? (
              <SheetItem label="No trusted senders yet" />
            ) : (
              settings.trustedSenders.map((email) => (
                <SheetItem
                  key={email}
                  label={email}
                  accessory="x"
                  onPress={() => confirmRemoveSender(email)}
                  accessibilityLabel={`Remove ${email}`}
                />
              ))
            )}
            <SheetTextField
              value={newSender}
              onChangeText={setNewSender}
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={saveSender}
              accessibilityLabel="Trusted sender email"
            />
          </SheetGroup>
          <SheetButton
            label="Add trusted sender"
            variant="secondary"
            icon="plus"
            onPress={saveSender}
            disabled={!canAddSender}
          />
        </SheetSection>

        <SheetSection title="Privacy">
          <SheetGroup>
            <SheetSwitchItem
              label="Block tracking pixels"
              detail="Remove tiny invisible tracker images from HTML email"
              value={settings.blockTrackingPixels}
              onValueChange={(value) => updateSettings({ blockTrackingPixels: value })}
            />
          </SheetGroup>
        </SheetSection>

        <SheetSection
          title="Email appearance"
          footer="How HTML messages are rendered in the reader."
        >
          <SheetGroup>
            {EMAIL_APPEARANCES.map((appearance) => (
              <SheetItem
                key={appearance}
                label={APPEARANCE_LABELS[appearance]}
                checked={settings.emailAppearance === appearance}
                onPress={() => updateSettings({ emailAppearance: appearance })}
                accessibilityRole="radio"
                accessibilityState={{ checked: settings.emailAppearance === appearance }}
              />
            ))}
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}
