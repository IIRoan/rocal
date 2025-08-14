import React, { useState } from "react";
import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/navigation/command";
import {
  RotateCcw,
  Check,
  X,
  ArrowLeft,
} from "lucide-react";
import type { PaletteView } from "./constants";

interface AccountSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goBack: (view: PaletteView) => void;
  saving: boolean;
  handleReset: () => void;
  TransitionContainer: React.ComponentType<{
    direction: "forward" | "back";
    children: React.ReactNode;
  }>;
  transitionDirection: "forward" | "back";
}

export function AccountSettings({
  open,
  onOpenChange,
  goBack,
  saving,
  handleReset,
  TransitionContainer,
  transitionDirection,
}: AccountSettingsProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <TransitionContainer direction={transitionDirection}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => goBack("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Account</h2>
        </div>
        <CommandList>
          {!showResetConfirm ? (
            <CommandGroup heading="Danger Zone">
              <CommandItem
                onSelect={() => setShowResetConfirm(true)}
                disabled={saving}
                className="px-4 py-3 hover:bg-destructive/10 data-[selected=true]:bg-destructive/15 text-destructive"
              >
                <RotateCcw className="mr-3 h-4 w-4" />
                <span>Reset to Defaults</span>
              </CommandItem>
            </CommandGroup>
          ) : (
            <CommandGroup heading="Confirm Reset">
              <div className="px-4 py-3 text-sm text-muted-foreground">
                This will reset all your settings to their default values.
                This action cannot be undone.
              </div>
              <CommandItem
                onSelect={() => {
                  handleReset();
                  setShowResetConfirm(false);
                }}
                disabled={saving}
                className="px-4 py-3 hover:bg-destructive/20 data-[selected=true]:bg-destructive/25 text-destructive"
              >
                <Check className="mr-3 h-4 w-4" />
                <span>Yes, Reset Everything</span>
              </CommandItem>
              <CommandItem
                onSelect={() => setShowResetConfirm(false)}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <X className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Cancel</span>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </TransitionContainer>
    </CommandDialog>
  );
}