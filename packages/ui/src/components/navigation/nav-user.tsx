import { LogOut, Settings } from "lucide-react";

import { BlobatarAvatar } from "../ui/blobatar-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useDropdownShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { User } from "../calendar/types";

export function NavUser({
  user,
  appName,
  isCollapsed = false,
  onLogout,
  onOpenSettings,
}: {
  user: User;
  appName: string;
  isCollapsed?: boolean;
  onLogout?: () => void;
  onOpenSettings?: () => void;
}) {
  useDropdownShortcuts([
    { key: "s", action: () => onOpenSettings?.() },
    { key: "l", action: () => onLogout?.() },
  ]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md p-1 outline-none transition-colors hover:bg-muted data-[state=open]:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <BlobatarAvatar
            email={user.email}
            name={user.name}
            src={user.avatar}
            className="size-7 shrink-0"
            title={user.name}
            animate="hover"
          />
          {isCollapsed ? null : (
            <span className="grid min-w-0 text-left leading-[130%]">
              <span className="truncate text-[13px] font-[470] text-foreground">
                {appName}
              </span>
              <span className="truncate text-[11px] uppercase tracking-[0.01em] text-muted-foreground">
                {user.name || user.email}
              </span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-60"
        side="bottom"
        align="start"
        sideOffset={6}
      >
        <div className="flex items-center gap-2 px-2 py-1.5">
          <BlobatarAvatar
            email={user.email}
            name={user.name}
            src={user.avatar}
            className="size-8 shrink-0"
          />
          <div className="grid min-w-0 leading-[130%]">
            <span className="truncate text-[15px] text-foreground">
              {user.name}
            </span>
            <span className="truncate text-[13px] text-muted-foreground">
              {user.email}
            </span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onOpenSettings}>
            <Settings size={16} />
            Settings
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLogout}>
            <LogOut size={16} />
            Sign out
            <DropdownMenuShortcut>⌘L</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
