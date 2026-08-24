import { ChevronRight, Shield, Users } from "lucide-react";

export function AccountMoreLinks({
  isBusy,
  onOpenSecurity,
  onOpenInvites,
}: {
  isBusy: boolean;
  onOpenSecurity?: () => void;
  onOpenInvites?: () => void;
}) {
  if (!onOpenInvites && !onOpenSecurity) return null;

  return (
    <>
      <div className="mt-1 border-t border-border/50 px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">
        More
      </div>
      <div className="px-2 pb-1">
        {onOpenSecurity ? (
          <button
            type="button"
            onClick={onOpenSecurity}
            disabled={isBusy}
            className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex size-6 shrink-0 items-center justify-center">
              <Shield className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">Security</div>
              <div className="text-xs text-muted-foreground">
                Passkeys &amp; authentication
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground/40 shrink-0" />
          </button>
        ) : null}
        {onOpenInvites ? (
          <button
            type="button"
            onClick={onOpenInvites}
            disabled={isBusy}
            className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex size-6 shrink-0 items-center justify-center">
              <Users className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">Invites</div>
              <div className="text-xs text-muted-foreground">
                Invite friends to join Solace
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground/40 shrink-0" />
          </button>
        ) : null}
      </div>
    </>
  );
}
