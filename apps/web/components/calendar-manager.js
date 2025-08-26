"use client";
import React, { useState } from "react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { TransitionContainer, PRESET_COLORS, resetCalendarForm, handleCalendarCreate, handleCalendarUpdate, handleCalendarDelete, } from "./command-palette/index";
import { CommandDialog, CommandList, CommandGroup, CommandItem, } from "@workspace/ui/components/navigation/command";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Button } from "@workspace/ui/components/ui/button";
import { ArrowLeft, Calendar, Plus, Save, Trash2, Loader2, ChevronRight, Globe, } from "lucide-react";
export function CalendarManager({ open, onOpenChange, onBack, onGoToSubscriptions, currentView, onViewChange, transitionDirection, }) {
    const calendarData = useSharedCalendarData();
    const { calendars } = calendarData;
    // Calendar management state
    const [calendarName, setCalendarName] = useState("");
    const [calendarColor, setCalendarColor] = useState("#3b82f6");
    const [calendarSaving, setCalendarSaving] = useState(false);
    const [editingCalendar, setEditingCalendar] = useState(null);
    const [calendarValidationErrors, setCalendarValidationErrors] = useState({});
    const goForward = (next) => {
        onViewChange(next);
    };
    const goBack = (prev) => {
        onViewChange(prev);
    };
    if (currentView === "calendars") {
        return (<CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
              <ArrowLeft className="h-4 w-4 text-muted-foreground"/>
            </button>
            <h2 className="text-lg font-semibold text-foreground">
              Calendar Management
            </h2>
          </div>
          <CommandList>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => {
                resetCalendarForm({
                    setCalendarName,
                    setCalendarColor,
                    setEditingCalendar,
                    setCalendarValidationErrors,
                });
                goForward("calendar-create");
            }} className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30">
                <Plus className="mr-3 h-4 w-4 text-muted-foreground"/>
                <span className="text-foreground">Create New Calendar</span>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60"/>
              </CommandItem>

              <CommandItem onSelect={onGoToSubscriptions} className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30">
                <Globe className="mr-3 h-4 w-4 text-muted-foreground"/>
                <span className="text-foreground">Subscribe to External Calendar</span>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60"/>
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Your Calendars">
              {calendars.map((calendar) => (<CommandItem key={calendar.id} onSelect={() => {
                    setEditingCalendar(calendar);
                    setCalendarName(calendar.name);
                    setCalendarColor(calendar.color);
                    setCalendarValidationErrors({});
                    goForward("calendar-edit");
                }} className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30">
                  <div className="mr-3 h-4 w-4 rounded" style={{ backgroundColor: calendar.color }}/>
                  <div className="flex flex-col">
                    <span className="text-foreground">{calendar.name}</span>
                    {calendar.isDefault && (<span className="text-xs text-muted-foreground">
                        Default calendar
                      </span>)}
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60"/>
                </CommandItem>))}
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>);
    }
    if (currentView === "calendar-create") {
        return (<CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button onClick={() => goBack("calendars")} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
              <ArrowLeft className="h-4 w-4 text-muted-foreground"/>
            </button>
            <h2 className="text-lg font-semibold text-foreground">
              Create Calendar
            </h2>
          </div>

          <div className="max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Calendar Name */}
              <div className="space-y-2">
                <Label htmlFor="calendar-name" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground"/>
                  Calendar Name
                </Label>
                <Input id="calendar-name" value={calendarName} onChange={(e) => {
                setCalendarName(e.target.value);
                if (calendarValidationErrors.name) {
                    setCalendarValidationErrors({
                        ...calendarValidationErrors,
                        name: undefined,
                    });
                }
            }} placeholder="Enter calendar name" className={calendarValidationErrors.name ? "border-red-500" : ""}/>
                {calendarValidationErrors.name && (<p className="text-sm text-red-600">
                    {calendarValidationErrors.name}
                  </p>)}
              </div>

              {/* Color Selection */}
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map((color) => (<button key={color} onClick={() => setCalendarColor(color)} className={`w-8 h-8 rounded-full border-2 transition-all ${calendarColor === color
                    ? "border-foreground scale-110"
                    : "border-transparent hover:scale-105"}`} style={{ backgroundColor: color }}/>))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="color" value={calendarColor} onChange={(e) => setCalendarColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer"/>
                  <span className="text-sm text-muted-foreground">
                    Or pick a custom color
                  </span>
                </div>
                {calendarValidationErrors.color && (<p className="text-sm text-red-600">
                    {calendarValidationErrors.color}
                  </p>)}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="border-t border-border bg-card/20 px-6 py-4 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => goBack("calendars")} disabled={calendarSaving}>
                Cancel
              </Button>
              <Button onClick={() => handleCalendarCreate(calendarName, calendarColor, calendars, calendarData, {
                setCalendarValidationErrors,
                setCalendarSaving,
                setCalendarName,
                setCalendarColor,
            }, () => goBack("calendars"))} disabled={calendarSaving || !calendarName.trim()}>
                {calendarSaving ? (<>
                    <Loader2 className="h-4 w-4 animate-spin mr-2"/>
                    Creating...
                  </>) : (<>
                    <Save className="h-4 w-4 mr-2"/>
                    Create Calendar
                  </>)}
              </Button>
            </div>
          </div>
        </TransitionContainer>
      </CommandDialog>);
    }
    if (currentView === "calendar-edit") {
        return (<CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button onClick={() => goBack("calendars")} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
              <ArrowLeft className="h-4 w-4 text-muted-foreground"/>
            </button>
            <h2 className="text-lg font-semibold text-foreground">
              Edit Calendar
            </h2>
          </div>

          <div className="max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Calendar Name */}
              <div className="space-y-2">
                <Label htmlFor="calendar-name" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground"/>
                  Calendar Name
                </Label>
                <Input id="calendar-name" value={calendarName} onChange={(e) => {
                setCalendarName(e.target.value);
                if (calendarValidationErrors.name) {
                    setCalendarValidationErrors({
                        ...calendarValidationErrors,
                        name: undefined,
                    });
                }
            }} placeholder="Enter calendar name" className={calendarValidationErrors.name ? "border-red-500" : ""}/>
                {calendarValidationErrors.name && (<p className="text-sm text-red-600">
                    {calendarValidationErrors.name}
                  </p>)}
              </div>

              {/* Color Selection */}
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map((color) => (<button key={color} onClick={() => setCalendarColor(color)} className={`w-8 h-8 rounded-full border-2 transition-all ${calendarColor === color
                    ? "border-foreground scale-110"
                    : "border-transparent hover:scale-105"}`} style={{ backgroundColor: color }}/>))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="color" value={calendarColor} onChange={(e) => setCalendarColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer"/>
                  <span className="text-sm text-muted-foreground">
                    Or pick a custom color
                  </span>
                </div>
                {calendarValidationErrors.color && (<p className="text-sm text-red-600">
                    {calendarValidationErrors.color}
                  </p>)}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="border-t border-border bg-card/20 px-6 py-4 flex items-center justify-between">
              {editingCalendar && (<Button variant="outline" onClick={() => handleCalendarDelete(editingCalendar, calendarData, setCalendarSaving, () => goBack("calendars"))} disabled={calendarSaving} className="text-destructive hover:text-destructive">
                  {calendarSaving ? (<Loader2 className="h-4 w-4 animate-spin mr-2"/>) : (<Trash2 className="h-4 w-4 mr-2"/>)}
                  Delete
                </Button>)}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => goBack("calendars")} disabled={calendarSaving}>
                  Cancel
                </Button>
                <Button onClick={() => handleCalendarUpdate(calendarName, calendarColor, calendars, editingCalendar, calendarData, {
                setCalendarValidationErrors,
                setCalendarSaving,
                setEditingCalendar,
            }, () => goBack("calendars"))} disabled={calendarSaving || !calendarName.trim()}>
                  {calendarSaving ? (<>
                      <Loader2 className="h-4 w-4 animate-spin mr-2"/>
                      Saving...
                    </>) : (<>
                      <Save className="h-4 w-4 mr-2"/>
                      Save Changes
                    </>)}
                </Button>
              </div>
            </div>
          </div>
        </TransitionContainer>
      </CommandDialog>);
    }
    return null;
}
