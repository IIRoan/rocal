"use client";

import { useState } from "react";
import { ChevronRight, Image, Paperclip, ShieldCheck } from "lucide-react";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import {
  useMailDisplaySettings,
  type ExternalContentPolicy,
  type EmailAppearance,
} from "@/lib/mail/mail-display-settings";
import { TrustedSendersDialog } from "./trusted-senders-dialog";
import {
  PaletteField,
  PaletteNavRow,
  PaletteSection,
  PaletteView,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";

export function MailDisplaySettingsPanel({ goBack }: { goBack: () => void }) {
  const { settings, updateSettings } = useMailDisplaySettings();
  const [trustedOpen, setTrustedOpen] = useState(false);

  const trustedCount = settings.trustedSenders.length;
  const trustedLabel =
    trustedCount === 0
      ? "No trusted senders"
      : trustedCount === 1
        ? "1 trusted sender"
        : `${trustedCount} trusted senders`;

  return (
    <>
      <PaletteView title="Content & display" onBack={goBack}>
        <PaletteSection label="External content">
          <PaletteField
            label="Remote images"
            htmlFor="mail-remote-images"
            hint="How to handle images and other remote content in email bodies"
          >
            <select
              id="mail-remote-images"
              value={settings.externalContentPolicy}
              onChange={(event) =>
                updateSettings({
                  externalContentPolicy: event.target
                    .value as ExternalContentPolicy,
                })
              }
              className={PALETTE_INPUT_CLASS}
            >
              <option value="ask">Ask before loading</option>
              <option value="block">Always block</option>
              <option value="allow">Always allow</option>
            </select>
          </PaletteField>

          <PaletteNavRow
            icon={ShieldCheck}
            label="Trusted senders"
            description="Senders who can load remote content automatically"
            onClick={() => setTrustedOpen(true)}
            trailing={
              <span className="flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground">
                {trustedLabel}
                <ChevronRight className="size-4 text-muted-foreground/50" />
              </span>
            }
          />

          <PaletteField
            label="Email appearance"
            htmlFor="mail-email-appearance"
            hint="How HTML messages are rendered in the reader"
          >
            <select
              id="mail-email-appearance"
              value={settings.emailAppearance}
              onChange={(event) =>
                updateSettings({
                  emailAppearance: event.target.value as EmailAppearance,
                })
              }
              className={PALETTE_INPUT_CLASS}
            >
              <option value="dark">Dark (adapt colors)</option>
              <option value="light">Light</option>
              <option value="original">Original (as sent)</option>
            </select>
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

      <TrustedSendersDialog open={trustedOpen} onOpenChange={setTrustedOpen} />
    </>
  );
}
