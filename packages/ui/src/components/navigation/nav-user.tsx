import {
  RiExpandUpDownLine,
  RiUserLine,
  RiGroupLine,
  RiSparklingLine,
  RiLogoutCircleLine,
} from "@remixicon/react";

import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { useDropdownShortcuts } from "../../hooks";

export function NavUser({
  user,
  onLogout,
  onOpenSettings,
}: {
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
  onOpenSettings?: () => void;
}) {
  const initials = user.name
    .split(" ")
    .map((name) => name.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  // Add keyboard shortcuts
  useDropdownShortcuts([
    { key: "s", action: () => onOpenSettings?.() },
    { key: "l", action: () => onLogout?.() },
  ]);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground [&>svg]:size-5"
            >
              <Avatar className="size-8">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
              </div>
              <RiExpandUpDownLine className="ml-auto size-5 text-muted-foreground/80" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) bg-sidebar"
            side="bottom"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="gap-3 focus:bg-sidebar-accent"
                onClick={onOpenSettings}
              >
                <RiGroupLine
                  size={20}
                  className="size-5 text-muted-foreground/80"
                />
                Settings
                <DropdownMenuShortcut>⌘+S</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-3 focus:bg-sidebar-accent"
                onClick={onLogout}
              >
                <RiLogoutCircleLine
                  size={20}
                  className="size-5 text-muted-foreground/80"
                />
                Logout
                <DropdownMenuShortcut>⌘+L</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
