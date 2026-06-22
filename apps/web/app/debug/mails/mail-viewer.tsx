"use client";

import { useState } from "react";
import { EmailFrame } from "./email-frame";

export type EmailPreview = {
  id: string;
  category: string;
  label: string;
  description: string;
  subject: string;
  html: string;
};

export function MailViewer({ previews }: { previews: EmailPreview[] }) {
  const [activeId, setActiveId] = useState(previews[0]?.id ?? "");
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");

  const active = previews.find((p) => p.id === activeId) ?? previews[0];
  const categories = [...new Set(previews.map((p) => p.category))];

  return (
    <div className="flex h-[calc(100vh-65px)]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border/60 overflow-y-auto bg-muted/20">
        {categories.map((cat) => (
          <div key={cat}>
            <div className="px-4 pt-5 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {cat}
              </p>
            </div>
            {previews.flatMap((p) =>
              p.category === cat
                ? [
                    <button
                      key={p.id}
                      onClick={() => setActiveId(p.id)}
                      className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 transition-colors border-l-2 ${
                        activeId === p.id
                          ? "bg-primary/8 border-primary"
                          : "border-transparent hover:bg-muted/40 hover:border-border"
                      }`}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {p.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                        {p.description}
                      </span>
                    </button>,
                  ]
                : [],
            )}
          </div>
        ))}
      </aside>

      {/* Preview area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="border-b border-border/60 px-6 py-3 flex items-center justify-between gap-4 bg-background/95 backdrop-blur shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              {active?.label}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 shrink-0">
                Subject
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {active?.subject}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 shrink-0">
            {(["desktop", "mobile"] as const).map((w) => (
              <button
                key={w}
                onClick={() => setWidth(w)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                  width === w
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {/* Email render */}
        <div className="flex-1 overflow-auto bg-muted/30 p-8">
          <div
            className={`mx-auto transition-[max-width] duration-300 ${
              width === "mobile" ? "max-w-[375px]" : "max-w-[680px]"
            }`}
          >
            <div className="rounded-xl overflow-hidden shadow-lg border border-border/30 bg-white">
              {active && <EmailFrame html={active.html} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
