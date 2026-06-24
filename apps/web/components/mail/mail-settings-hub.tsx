"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import {
  MAIL_SETTINGS_NAV_ITEMS,
  type MailSettingsView,
} from "./mail-settings-navigation";

export function MailSettingsHub({
  goBack,
  onNavigate,
}: {
  goBack: () => void;
  onNavigate: (view: MailSettingsView) => void;
}) {
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
          aria-label="Back"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">Mail settings</span>
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {MAIL_SETTINGS_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className="flex items-center gap-3 p-2 sm:py-1.5 min-h-[44px] w-full rounded-md text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors group"
          >
            <div className="flex items-center justify-center size-8 sm:w-6 sm:h-6 shrink-0">
              <item.icon className="h-[18px] w-[18px] sm:h-4 sm:w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm">{item.label}</div>
              <div className="text-xs text-muted-foreground truncate">
                {item.description}
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  );
}
