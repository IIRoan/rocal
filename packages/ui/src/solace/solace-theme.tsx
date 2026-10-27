"use client";

import * as React from "react";

import "@workspace/ui/solace/theme.css";
import { cn } from "@workspace/ui/lib/utils";

export function SolaceTheme({
  children,
  className,
  scoped = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Keeps the mail tokens inside this subtree instead of theming the whole document. */
  scoped?: boolean;
}) {
  return (
    <div
      data-solace
      data-solace-scoped={scoped || undefined}
      className={cn("h-full min-h-0", className)}
    >
      {children}
    </div>
  );
}
