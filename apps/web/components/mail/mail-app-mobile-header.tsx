import { Button } from "@workspace/ui/components/ui/button";
import { MobileAppSwitcher } from "@/components/mobile-app-switcher";
import { useSidebar } from "@workspace/ui/components/ui/sidebar";
import { Menu, Pencil, RotateCcw } from "lucide-react";

export type MobileMailHeaderRefreshState = {
  disabled: boolean;
  spinning: boolean;
};

export interface MobileMailHeaderProps {
  selectedMailboxName: string;
  mailboxEmail: string;
  refresh: MobileMailHeaderRefreshState;
  onRefresh: () => void;
  onCompose: () => void;
}

export function MobileMailHeader({
  selectedMailboxName,
  mailboxEmail,
  refresh,
  onRefresh,
  onCompose,
}: MobileMailHeaderProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="safe-area-inset-top px-4 pb-3 pt-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 rounded-xl text-muted-foreground"
            onClick={toggleSidebar}
            aria-label="Open mailboxes"
          >
            <Menu size={18} strokeWidth={2.25} />
          </Button>

          <div className="flex min-w-0 flex-1 justify-center">
            <MobileAppSwitcher activeApp="mail" />
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 rounded-xl text-muted-foreground"
            onClick={onCompose}
            aria-label="Compose message"
          >
            <Pencil size={18} strokeWidth={2.25} />
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {selectedMailboxName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {mailboxEmail}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 rounded-xl text-muted-foreground disabled:opacity-40"
              disabled={refresh.disabled}
              onClick={onRefresh}
              aria-label="Refresh mail"
              title="Refresh mail"
            >
              <RotateCcw
                size={16}
                strokeWidth={2.25}
                className={
                  refresh.spinning ? "animate-spin" : "transition-transform"
                }
              />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
