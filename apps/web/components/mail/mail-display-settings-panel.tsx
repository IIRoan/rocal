"use client";

import { Image, Paperclip, ShieldCheck } from "lucide-react";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import { useMailDisplaySettings } from "@/lib/mail/mail-display-settings";
import {
  PaletteField,
  PaletteNavRow,
  PaletteSection,
  PaletteSelect,
  PaletteView,
} from "../command-palette/palette-ui";

const REMOTE_IMAGES_OPTIONS = [
  { value: "ask", label: "Ask before loading" },
  { value: "block", label: "Always block" },
  { value: "allow", label: "Always allow" },
] as const;

const EMAIL_APPEARANCE_OPTIONS = [
  { value: "dark", label: "Dark (adapt colors)" },
  { value: "light", label: "Light" },
  { value: "original", label: "Original (as sent)" },
] as const;

export function MailDisplaySettingsPanel({
  goBack,
  onOpenTrustedSenders,
}: {
  goBack: () => void;
  onOpenTrustedSenders: () => void;
}) {
  const { settings, updateSettings } = useMailDisplaySettings();

  const trustedCount = settings.trustedSenders.length;
  const trustedLabel =
    trustedCount === 0
      ? "No trusted senders"
      : trustedCount === 1
        ? "1 trusted sender"
        : `${trustedCount} trusted senders`;

  return (
    <PaletteView title="Content & display" onBack={goBack}>
      <PaletteSection label="External content">
        <PaletteField
          label="Remote images"
          htmlFor="mail-remote-images"
          hint="How to handle images and other remote content in email bodies"
        >
          <PaletteSelect
            id="mail-remote-images"
            label="Remote images"
            value={settings.externalContentPolicy}
            options={REMOTE_IMAGES_OPTIONS}
            onValueChange={(externalContentPolicy) =>
              updateSettings({ externalContentPolicy })
            }
          />
        </PaletteField>

        <PaletteNavRow
          icon={ShieldCheck}
          label="Trusted senders"
          description={trustedLabel}
          onClick={onOpenTrustedSenders}
        />

        <PaletteField
          label="Email appearance"
          htmlFor="mail-email-appearance"
          hint="How HTML messages are rendered in the reader"
        >
          <PaletteSelect
            id="mail-email-appearance"
            label="Email appearance"
            value={settings.emailAppearance}
            options={EMAIL_APPEARANCE_OPTIONS}
            onValueChange={(emailAppearance) =>
              updateSettings({ emailAppearance })
            }
          />
        </PaletteField>
      </PaletteSection>

      <PaletteSection label="Privacy">
        <SettingToggleRow
          icon={Image}
          label="Block tracking pixels"
          description="Remove tiny invisible tracker images from HTML email"
          checked={settings.blockTrackingPixels}
          onToggle={() =>
            updateSettings({
              blockTrackingPixels: !settings.blockTrackingPixels,
            })
          }
        />
      </PaletteSection>

      <PaletteSection label="Attachments">
        <SettingToggleRow
          icon={Paperclip}
          label="Hide inline image attachments"
          description="Do not list CID inline images in the attachment chips above the body"
          checked={settings.hideInlineImageAttachments}
          onToggle={() =>
            updateSettings({
              hideInlineImageAttachments: !settings.hideInlineImageAttachments,
            })
          }
        />

        <SettingToggleRow
          icon={Image}
          label="Attachment image previews"
          description="Show hover previews for image and PDF attachments"
          checked={settings.attachmentImagePreviewsEnabled}
          onToggle={() =>
            updateSettings({
              attachmentImagePreviewsEnabled:
                !settings.attachmentImagePreviewsEnabled,
            })
          }
        />
      </PaletteSection>
    </PaletteView>
  );
}
