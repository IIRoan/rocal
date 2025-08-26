"use client";
import React from "react";
import { Calendar, Plus, Grid3X3, LayoutGrid } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger, } from "../ui/dropdown-menu";
import { useDropdownShortcuts } from "../../hooks";
export function MobileBottomNav({ onOpenSidebar, onOpenAddEvent, currentView = "month", onViewChange, className, }) {
    // Add keyboard shortcuts for view changes
    useDropdownShortcuts([
        { key: "d", action: () => onViewChange?.("day") },
        { key: "w", action: () => onViewChange?.("week") },
        { key: "m", action: () => onViewChange?.("month") },
        { key: "a", action: () => onViewChange?.("agenda") },
    ]);
    const getViewIcon = (view) => {
        switch (view) {
            case "day":
                return <div className="w-5 h-5 border-2 border-current rounded"/>;
            case "week":
                return <Grid3X3 size={20}/>;
            case "month":
                return <Calendar size={20}/>;
            case "agenda":
                return <LayoutGrid size={20}/>;
            default:
                return <Calendar size={20}/>;
        }
    };
    return (<div className={cn("fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border md:hidden", className)}>
      <div className="flex items-center justify-center px-4 py-2 safe-area-inset-bottom">
        <div className="flex items-center justify-around w-full max-w-sm">
          <Button variant="ghost" size="sm" onClick={() => {
            console.log('Calendar button clicked');
            onOpenSidebar?.();
        }} className="flex flex-col items-center gap-1 h-auto py-2 px-3">
            <Calendar size={20}/>
            <span className="text-xs">Calendar</span>
          </Button>
          
          <Button variant="ghost" size="sm" onClick={() => {
            console.log('Add button clicked');
            onOpenAddEvent?.();
        }} className="flex flex-col items-center gap-1 h-auto py-2 px-3 bg-primary/10 text-primary">
            <Plus size={20}/>
            <span className="text-xs">Add</span>
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex flex-col items-center gap-1 h-auto py-2 px-3">
                {getViewIcon(currentView)}
                <span className="text-xs capitalize">{currentView}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" className="mb-2">
              <DropdownMenuItem onClick={() => onViewChange?.("day")}>
                <div className="w-4 h-4 border-2 border-current rounded mr-2"/>
                Day
                <DropdownMenuShortcut>⌘+D</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange?.("week")}>
                <Grid3X3 size={16} className="mr-2"/>
                Week
                <DropdownMenuShortcut>⌘+W</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange?.("month")}>
                <Calendar size={16} className="mr-2"/>
                Month
                <DropdownMenuShortcut>⌘+M</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange?.("agenda")}>
                <LayoutGrid size={16} className="mr-2"/>
                Agenda
                <DropdownMenuShortcut>⌘+A</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>);
}
