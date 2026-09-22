"use client";

import * as React from "react";

import "@workspace/ui/solace/theme.css";
import { cn } from "@workspace/ui/lib/utils";

export function SolaceTheme({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-solace className={cn("h-full min-h-0", className)}>
      {children}
    </div>
  );
}
