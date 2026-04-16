import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { RotateCcw, Check, X, ArrowLeft, AlertTriangle } from "lucide-react";
import type { PaletteView } from "./constants";

interface AccountSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goBack: () => void;
  saving: boolean;
  handleReset: () => void;
  TransitionContainer: React.ComponentType<{
    direction: "forward" | "back";
    children: React.ReactNode;
    viewKey?: string;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
      >
        <VisuallyHidden>
          <DialogTitle>Account Settings</DialogTitle>
        </VisuallyHidden>
        <TransitionContainer direction={transitionDirection} viewKey="account">
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
              <button
                onClick={() => goBack()}
                className="p-1 rounded hover:bg-muted/50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-sm font-medium">Account</span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-1">
              {!showResetConfirm ? (
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  Danger Zone
                </div>
              ) : null}

              {!showResetConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={saving}
                  className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-destructive/5 focus:bg-destructive/10 focus:outline-none transition-colors text-destructive"
                >
                  <RotateCcw className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Reset to Defaults</span>
                </button>
              ) : (
                <div className="p-1">
                  <div className="flex items-start gap-3 px-3 py-3 text-xs text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      This will reset all your settings to their default values.
                      This action cannot be undone.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleReset();
                      setShowResetConfirm(false);
                    }}
                    disabled={saving}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-destructive/10 focus:bg-destructive/15 focus:outline-none transition-colors text-destructive"
                  >
                    <Check className="h-4 w-4 shrink-0" />
                    <span className="text-sm">Yes, Reset Everything</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Cancel</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </TransitionContainer>
      </DialogContent>
    </Dialog>
  );
}
