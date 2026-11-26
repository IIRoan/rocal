import type { ReactNode } from "react";

/** The shared surface of compose's menus: sender, templates, signature and schedule. */
export const COMPOSE_MENU_CLASS =
  "z-[100] flex max-h-[min(28rem,calc(100dvh-6rem))] max-w-[calc(100dvw-2rem)] flex-col gap-0.5 overflow-y-auto rounded-xl p-1.5";

export const COMPOSE_TOOL_CLASS =
  "inline-flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] text-[var(--icon-secondary)] transition-colors hover:bg-[var(--bg-overlay-tertiary)] hover:text-[var(--icon-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";

export function ComposeMenuHeading({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{children}</p>;
}

export function ComposeMenuNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 border-t border-[var(--border-tertiary)] px-2.5 pt-2 pb-1 text-[11.5px] leading-snug text-muted-foreground">
      {children}
    </p>
  );
}
