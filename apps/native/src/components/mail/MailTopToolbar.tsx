import React from "react";
import { Feather } from "@expo/vector-icons";
import { useSidebar } from "../../providers/SidebarProvider";
import { HeaderIconButton, SurfaceTitle, SurfaceToolbar } from "../layout";

interface MailTopToolbarProps {
  onMenu: () => void;
  onSearch: () => void;
  mailboxName?: string;
  mailboxIcon?: keyof typeof Feather.glyphMap;
}

export function MailTopToolbar({
  onMenu,
  onSearch,
  mailboxName = "Mail",
  mailboxIcon = "mail",
}: MailTopToolbarProps) {
  return (
    <SurfaceToolbar
      bordered={false}
      leading={
        <HeaderIconButton
          name="menu"
          size={22}
          onPress={onMenu}
          accessibilityLabel="Open menu"
        />
      }
      center={<SurfaceTitle title={mailboxName} icon={mailboxIcon} centered />}
      trailing={
        <HeaderIconButton
          name="search"
          size={20}
          onPress={onSearch}
          accessibilityLabel="Search mail"
        />
      }
    />
  );
}
