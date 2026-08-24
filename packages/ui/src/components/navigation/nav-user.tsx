import { CaretDownIcon, GearSixIcon, SignOutIcon } from "@phosphor-icons/react";

import { BlobatarAvatar } from "../ui/blobatar-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { useDropdownShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { User } from "../calendar/types";

export function NavUser({
  user,
  onLogout,
  onOpenSettings,
}: {
  user: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
}) {
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
              className="group data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <BlobatarAvatar
                email={user.email}
                name={user.name}
                src={user.avatar}
                className="size-8"
                title={user.name}
                animate="hover"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
              </div>
              <span className="ml-auto size-5 text-muted-foreground/80 transition-transform duration-200 group-data-[state=open]:rotate-180">
                <CaretDownIcon size={20} />
              </span>
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
                <span className="size-5 text-muted-foreground/80">
                  <GearSixIcon size={20} />
                </span>
                Settings
                <DropdownMenuShortcut>⌘+S</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-3 focus:bg-sidebar-accent"
                onClick={onLogout}
              >
                <span className="size-5 text-muted-foreground/80">
                  <SignOutIcon size={20} />
                </span>
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
