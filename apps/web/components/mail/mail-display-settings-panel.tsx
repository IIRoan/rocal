"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Image, Paperclip, ShieldCheck } from "lucide-react";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
import {
  useMailDisplaySettings,
  type ExternalContentPolicy,
  type EmailAppearance,
} from "@/lib/mail/mail-display-settings";
import { TrustedSendersDialog } from "./trusted-senders-dialog";

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
          <span className="text-sm font-medium">Content &amp; display</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="px-3 py-2">
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              External content
            </div>
          </div>

          <div className="px-3 py-3 border-t border-border/40">
            <label className="text-sm font-medium">Remote images</label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              How to handle images and other remote content in email bodies
            </p>
            <select
              value={settings.externalContentPolicy}
              onChange={(event) =>
                updateSettings({
                  externalContentPolicy: event.target
                    .value as ExternalContentPolicy,
                })
              }
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="ask">Ask before loading</option>
              <option value="block">Always block</option>
              <option value="allow">Always allow</option>
            </select>
          </div>

          <div className="px-3 py-3 border-t border-border/40">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm">Trusted senders</div>
                <div className="text-xs text-muted-foreground">
                  Senders who can load remote content automatically
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTrustedOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent rounded-md transition-colors shrink-0"
              >
                <span className="text-sm text-foreground">{trustedLabel}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="px-3 py-3 border-t border-border/40">
            <label className="text-sm font-medium">Email appearance</label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              How HTML messages are rendered in the reader
            </p>
            <select
              value={settings.emailAppearance}
              onChange={(event) =>
                updateSettings({
                  emailAppearance: event.target.value as EmailAppearance,
                })
              }
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="dark">Dark (adapt colors)</option>
              <option value="light">Light</option>
              <option value="original">Original (as sent)</option>
            </select>
          </div>

          <div className="px-3 py-2 mt-2 border-t border-border/40">
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Privacy
            </div>
          </div>

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

          <div className="px-3 py-2 mt-2 border-t border-border/40">
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Attachments
            </div>
          </div>

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
        </div>
      </div>

      <TrustedSendersDialog open={trustedOpen} onOpenChange={setTrustedOpen} />
    </>
  );
}
