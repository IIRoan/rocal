"use client";

import type { SectionMessage } from "./account-settings-types";

export function InlineMessage({ msg }: { msg: SectionMessage }) {
  if (!msg) return null;
  return (
    <div
      className={`rounded-lg px-3 py-2 text-[13px] ${
        msg.kind === "success"
          ? "bg-secondary/10 text-secondary-foreground"
          : "bg-destructive/10 text-destructive"
      }`}
      role={msg.kind === "error" ? "alert" : "status"}
    >
      {msg.text}
    </div>
  );
}
