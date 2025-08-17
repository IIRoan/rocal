"use client";

import React from "react";
import { Calendar, Plus, Settings } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

interface MobileBottomNavProps {
  onOpenSidebar?: () => void;
  onOpenAddEvent?: () => void;
  onOpenSettings?: () => void;
  className?: string;
}

export function MobileBottomNav({
  onOpenSidebar,
  onOpenAddEvent,
  onOpenSettings,
  className,
}: MobileBottomNavProps) {
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border md:hidden",
        className
      )}
    >
      <div className="flex items-center justify-center px-4 py-2 safe-area-inset-bottom">
        <div className="flex items-center justify-around w-full max-w-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              console.log('Calendar button clicked');
              onOpenSidebar?.();
            }}
            className="flex flex-col items-center gap-1 h-auto py-2 px-3"
          >
            <Calendar size={20} />
            <span className="text-xs">Calendar</span>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              console.log('Add button clicked');
              onOpenAddEvent?.();
            }}
            className="flex flex-col items-center gap-1 h-auto py-2 px-3 bg-primary/10 text-primary"
          >
            <Plus size={20} />
            <span className="text-xs">Add</span>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              console.log('Settings button clicked, onOpenSettings:', onOpenSettings);
              onOpenSettings?.();
            }}
            className="flex flex-col items-center gap-1 h-auto py-2 px-3"
          >
            <Settings size={20} />
            <span className="text-xs">Settings</span>
          </Button>
        </div>
      </div>
    </div>
  );
}