import React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { Key, ChevronRight, ArrowLeft } from "lucide-react";
import type { PaletteView } from "./constants";

interface SecuritySettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goBack: (view: PaletteView) => void;
  goForward: (view: PaletteView) => void;
  TransitionContainer: React.ComponentType<{
    direction: "forward" | "back";
    children: React.ReactNode;
    viewKey?: string;
  }>;
  transitionDirection: "forward" | "back";
}

export function SecuritySettings({
  open,
  onOpenChange,
  goBack,
  goForward,
  TransitionContainer,
  transitionDirection,
}: SecuritySettingsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
      >
        <VisuallyHidden>
          <DialogTitle>Security Settings</DialogTitle>
        </VisuallyHidden>
        <TransitionContainer direction={transitionDirection} viewKey="security">
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
              <button
                onClick={() => goBack("main")}
                className="p-1 rounded hover:bg-muted/50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-sm font-medium">Security</span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Authentication Section */}
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                Authentication
              </div>
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => goForward("passkeys")}
                  className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                >
                  <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">Passkeys</div>
                    <div className="text-xs text-muted-foreground">
                      Manage passwordless authentication
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </TransitionContainer>
      </DialogContent>
    </Dialog>
  );
}
