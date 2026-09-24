"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { cn } from "@workspace/ui/lib/utils";

type CommandPaletteDesktopDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hasBothResults: boolean;
  children: ReactNode;
};

export function CommandPaletteDesktopDialog({
  open,
  onOpenChange,
  title,
  hasBothResults,
  children,
}: CommandPaletteDesktopDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        aria-describedby={undefined}
        // Width snaps instead of tweening: a width animation re-lays out every result row per frame, which stutters in Firefox.
        className={cn(
          "overflow-hidden p-0 bg-popover border-border/50 shadow-2xl flex flex-col",
          hasBothResults && "w-[760px]",
        )}
      >
        <VisuallyHidden>
          <DialogTitle>{title}</DialogTitle>
        </VisuallyHidden>
        {children}
      </DialogContent>
    </Dialog>
  );
}
