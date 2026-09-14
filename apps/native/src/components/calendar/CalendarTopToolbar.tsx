import React from "react";
import { useRouter } from "expo-router";
import { useSidebar } from "../../providers/SidebarProvider";
import { HeaderIconButton, SurfaceToolbar } from "../layout";
import { SurfaceAppSwitcherTitle } from "../SurfaceAppSwitcherTitle";

interface CalendarTopToolbarProps {
  onNewEvent?: () => void;
}

export function CalendarTopToolbar({ onNewEvent }: CalendarTopToolbarProps) {
  const { toggle: toggleSidebar } = useSidebar();
  const router = useRouter();

  const handleNewEvent = () => {
    if (onNewEvent) {
      onNewEvent();
      return;
    }
    router.push("/event/create" as never);
  };

  return (
    <SurfaceToolbar
      bordered
      leading={
        <HeaderIconButton
          name="menu"
          size={22}
          onPress={toggleSidebar}
          accessibilityLabel="Open menu"
        />
      }
      center={<SurfaceAppSwitcherTitle activeApp="calendar" />}
      trailing={
        <HeaderIconButton
          name="plus"
          size={20}
          onPress={handleNewEvent}
          accessibilityLabel="Create new event"
        />
      }
    />
  );
}
