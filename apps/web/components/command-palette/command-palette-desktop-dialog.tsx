"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { gsap, useGSAP } from "@workspace/ui/lib/gsap";

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
  const dialogInnerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      const inner = dialogInnerRef.current;
      if (!inner) return;
      const dialogEl = inner.closest<HTMLElement>('[data-slot="dialog-content"]');
      if (!dialogEl) return;
      const targetW = hasBothResults ? 760 : 560;
      if (prefersReducedMotion) {
        gsap.set(dialogEl, { width: targetW });
        return;
      }
      gsap.to(dialogEl, {
        width: targetW,
        duration: 0.22,
        ease: "power2.inOut",
      });
    },
    { dependencies: [hasBothResults, prefersReducedMotion] },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        aria-describedby={undefined}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl flex flex-col"
      >
        <div ref={dialogInnerRef} style={{ display: "contents" }}>
          <VisuallyHidden>
            <DialogTitle>{title}</DialogTitle>
          </VisuallyHidden>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
