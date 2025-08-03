"use client";

import * as React from "react";
import { RiCheckLine, RiAddLine } from "@remixicon/react";
import { useCalendarContext } from "../calendar/calendar-context";
import { CreateCalendarData, EventColor } from "../calendar/types";
import LogoSvg from "./logo";

import { NavUser } from "../navigation/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarTrigger,
} from "../ui/sidebar";
import { SidebarCalendar } from "../navigation/sidebar-calendar";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ColorPicker } from "../ui/color-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
  onOpenSettings?: () => void;
}

export function AppSidebar({
  user,
  onLogout,
  onOpenSettings,
  ...props
}: AppSidebarProps) {
  const {
    calendars,
    addCalendar,
    toggleCalendarVisibility,
    isCalendarVisible,
  } = useCalendarContext();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [newCalendarName, setNewCalendarName] = React.useState("");
  const [newCalendarColor, setNewCalendarColor] =
    React.useState<string>("#3b82f6");

  const handleCreateCalendar = () => {
    if (newCalendarName.trim()) {
      const calendarData: CreateCalendarData = {
        name: newCalendarName.trim(),
        color: newCalendarColor,
      };
      addCalendar(calendarData);
      setNewCalendarName("");
      setNewCalendarColor("#3b82f6");
      setIsDialogOpen(false);
    }
  };

  const presetColors = [
    "#3b82f6", // blue
    "#10b981", // emerald
    "#f59e0b", // orange
    "#8b5cf6", // violet
    "#f43f5e", // rose
    "#ef4444", // red
    "#06b6d4", // cyan
    "#84cc16", // lime
    "#f97316", // orange-500
    "#6366f1", // indigo
    "#ec4899", // pink
    "#14b8a6", // teal
  ];

  return (
    <Sidebar variant="inset" {...props} className="max-lg:p-3 lg:pe-1">
      <SidebarHeader>
        <div className="flex justify-between items-center gap-2">
          <a className="inline-flex" href="/">
            <LogoSvg width="32" height="32" className="text-foreground/80" />
          </a>
          <SidebarTrigger className="text-muted-foreground/80 hover:text-foreground/80 hover:bg-transparent!" />
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0 mt-3 pt-3 border-t">
        <SidebarGroup className="px-1">
          <SidebarCalendar />
        </SidebarGroup>
        <SidebarGroup className="px-1 mt-3 pt-4 border-t">
          <div className="flex items-center justify-between">
            <SidebarGroupLabel className="uppercase text-muted-foreground/65">
              Calendars
            </SidebarGroupLabel>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <RiAddLine size={14} />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create New Calendar</DialogTitle>
                  <DialogDescription>
                    Add a new calendar to organize your events.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label
                      htmlFor="calendar-name"
                      className="text-sm font-medium"
                    >
                      Calendar Name
                    </label>
                    <Input
                      id="calendar-name"
                      value={newCalendarName}
                      onChange={(e) => setNewCalendarName(e.target.value)}
                      placeholder="Enter calendar name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label
                      htmlFor="calendar-color"
                      className="text-sm font-medium"
                    >
                      Color
                    </label>
                    <ColorPicker
                      value={newCalendarColor}
                      onChange={setNewCalendarColor}
                      presetColors={presetColors}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleCreateCalendar}>
                      Create Calendar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {calendars.map((calendar) => (
                <SidebarMenuItem key={calendar.id}>
                  <SidebarMenuButton
                    asChild
                    className="relative rounded-md [&>svg]:size-auto justify-between has-focus-visible:border-ring has-focus-visible:ring-ring/50 has-focus-visible:ring-[3px]"
                  >
                    <span>
                      <span className="font-medium flex items-center justify-between gap-3">
                        <Checkbox
                          id={calendar.id}
                          className="sr-only peer"
                          checked={isCalendarVisible(calendar.id)}
                          onCheckedChange={() =>
                            toggleCalendarVisibility(calendar.id)
                          }
                        />
                        <RiCheckLine
                          className="peer-not-data-[state=checked]:invisible"
                          size={16}
                          aria-hidden="true"
                        />
                        <label
                          htmlFor={calendar.id}
                          className="peer-not-data-[state=checked]:line-through peer-not-data-[state=checked]:text-muted-foreground/65 after:absolute after:inset-0"
                        >
                          {calendar.name}
                        </label>
                      </span>
                      <span
                        className="size-1.5 rounded-full"
                        style={{
                          backgroundColor: calendar.color?.startsWith("#")
                            ? calendar.color
                            : `var(--color-event-${calendar.color || "default"})`,
                        }}
                      ></span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={
            user || {
              name: "Guest User",
              email: "guest@example.com",
              avatar: "",
            }
          }
          onLogout={onLogout}
          onOpenSettings={onOpenSettings}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
