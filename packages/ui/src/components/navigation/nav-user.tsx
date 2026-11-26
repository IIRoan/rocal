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
import { useShortcutLabel } from "../../hooks/use-shortcut-label";
import { User } from "../calendar/types";

/** The account avatar at the foot of the sidebar rail, opening Settings and Sign out. */
export function NavUser({
  user,
  onLogout,
  onOpenSettings,
}: {
  user: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
}) {
  useDropdownShortcuts([
    { key: "s", action: () => onOpenSettings?.() },
    { key: "l", action: () => onLogout?.() },
  ]);
  const settingsShortcut = useShortcutLabel("S");
  const signOutShortcut = useShortcutLabel("L");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu, ${user.name || user.email}`}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none transition-colors hover:bg-muted data-[state=open]:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BlobatarAvatar
            email={user.email}
            name={user.name}
            src={user.avatar}
            className="size-7 shrink-0"
            title={user.name}
            animate="hover"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" side="right" align="end" sideOffset={8}>
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
            <DropdownMenuShortcut>{settingsShortcut}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLogout}>
            <LogOut size={16} />
            Sign out
            <DropdownMenuShortcut>{signOutShortcut}</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
