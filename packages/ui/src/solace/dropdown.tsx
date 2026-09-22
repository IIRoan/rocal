"use client";

import * as React from "react";
import {
  ContextMenu as ContextMenuPrimitive,
  DropdownMenu as DropdownMenuPrimitive,
  Popover as PopoverPrimitive,
} from "radix-ui";

import { cn } from "@workspace/ui/lib/utils";

import Icons from "./icons";
import { Icon } from "./icons.constants";

type MenuKind = "dropdown" | "context";

const MenuKindContext = React.createContext<MenuKind>("dropdown");

const PRIMITIVES = {
  dropdown: DropdownMenuPrimitive,
  context: ContextMenuPrimitive,
} as const;

const SURFACE_CLASS =
  "z-50 overflow-hidden rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-l3-solid)] text-[var(--text-primary)] shadow-[var(--shadow-l2)] outline-none";

const MENU_SURFACE_CLASS = cn(
  SURFACE_CLASS,
  "flex max-h-[min(28rem,var(--radix-dropdown-menu-content-available-height,28rem))] flex-col gap-px overflow-y-auto p-1",
);

const ITEM_CLASS =
  "group/item flex h-8 w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2 text-left text-[15px] leading-[130%] text-[var(--text-primary)] outline-none transition-colors data-[highlighted]:bg-[var(--bg-cell-hover)] data-[state=open]:bg-[var(--bg-cell-hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-40";

const DESTRUCTIVE_ITEM_CLASS =
  "text-[var(--text-destructive)] data-[highlighted]:bg-[var(--cta-destructive-hover)]";

/** React bubbles portal clicks to the trigger's ancestors (e.g. a clickable mail row); stop that. */
function stopPortalClick(event: React.MouseEvent) {
  event.stopPropagation();
}

function surfaceWidthStyle(width?: number | string): React.CSSProperties {
  return width === undefined
    ? { minWidth: 180 }
    : { width: typeof width === "number" ? `${width}px` : width };
}

export interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  width?: number | string;
  modal?: boolean;
  className?: string;
}

/** Nightwatch dropdown menu (Radix keyboard + focus handling). */
export function Dropdown({
  trigger,
  children,
  open,
  onOpenChange,
  align = "end",
  side = "bottom",
  sideOffset = 6,
  width,
  modal = false,
  className,
}: DropdownProps) {
  const style = surfaceWidthStyle(width);
  return (
    <MenuKindContext.Provider value="dropdown">
      <DropdownMenuPrimitive.Root
        open={open}
        onOpenChange={onOpenChange}
        modal={modal}
      >
        <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            data-surface-motion=""
            align={align}
            side={side}
            sideOffset={sideOffset}
            collisionPadding={8}
            className={cn(MENU_SURFACE_CLASS, className)}
            style={style}
            onClick={stopPortalClick}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            {children}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </MenuKindContext.Provider>
  );
}

export interface ContextDropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  width?: number | string;
  onOpenChange?: (open: boolean) => void;
}

/** Right-click variant of `Dropdown`; items and submenus are shared. */
export function ContextDropdown({
  trigger,
  children,
  width,
  onOpenChange,
}: ContextDropdownProps) {
  const style = surfaceWidthStyle(width);
  return (
    <MenuKindContext.Provider value="context">
      <ContextMenuPrimitive.Root onOpenChange={onOpenChange} modal={false}>
        <ContextMenuPrimitive.Trigger asChild>{trigger}</ContextMenuPrimitive.Trigger>
        <ContextMenuPrimitive.Portal>
          <ContextMenuPrimitive.Content
            data-surface-motion=""
            collisionPadding={8}
            className={MENU_SURFACE_CLASS}
            style={style}
            onClick={stopPortalClick}
          >
            {children}
          </ContextMenuPrimitive.Content>
        </ContextMenuPrimitive.Portal>
      </ContextMenuPrimitive.Root>
    </MenuKindContext.Provider>
  );
}

export interface DropdownItemProps {
  label: React.ReactNode;
  icon?: Icon;
  startElement?: React.ReactNode;
  endElement?: React.ReactNode;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: (event: Event) => void;
}

export function DropdownItem({
  label,
  icon,
  startElement,
  endElement,
  active = false,
  destructive = false,
  disabled,
  onSelect,
}: DropdownItemProps) {
  const Primitive = PRIMITIVES[React.use(MenuKindContext)];
  return (
    <Primitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(ITEM_CLASS, destructive && DESTRUCTIVE_ITEM_CLASS)}
    >
      {icon ? (
        <Icons
          icon={icon}
          color={destructive ? "destructive" : "secondary"}
          className={destructive ? undefined : "group-data-[highlighted]/item:!text-[var(--icon-primary)]"}
        />
      ) : (
        startElement
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {endElement}
      {active ? <Icons icon={Icon.Check} color="primary" /> : null}
    </Primitive.Item>
  );
}

export interface DropdownSubmenuProps {
  label: string;
  icon?: Icon;
  disabled?: boolean;
  width?: number | string;
  children: React.ReactNode;
}

export function DropdownSubmenu({
  label,
  icon,
  disabled,
  width,
  children,
}: DropdownSubmenuProps) {
  const Primitive = PRIMITIVES[React.use(MenuKindContext)];
  const style = surfaceWidthStyle(width);
  return (
    <Primitive.Sub>
      <Primitive.SubTrigger disabled={disabled} className={ITEM_CLASS}>
        {icon ? (
          <Icons
            icon={icon}
            color="secondary"
            className="group-data-[highlighted]/item:!text-[var(--icon-primary)] group-data-[state=open]/item:!text-[var(--icon-primary)]"
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Icons icon={Icon.ChevronRight} color="disabled" size={14} />
      </Primitive.SubTrigger>
      <Primitive.Portal>
        <Primitive.SubContent
          data-surface-motion=""
          sideOffset={6}
          collisionPadding={8}
          className={MENU_SURFACE_CLASS}
          style={style}
        >
          {children}
        </Primitive.SubContent>
      </Primitive.Portal>
    </Primitive.Sub>
  );
}

export function DropdownDivider() {
  const Primitive = PRIMITIVES[React.use(MenuKindContext)];
  return (
    <Primitive.Separator className="-mx-1 my-1 h-px shrink-0 bg-[var(--border-tertiary)]" />
  );
}

export function DropdownSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const Primitive = PRIMITIVES[React.use(MenuKindContext)];
  return (
    <Primitive.Group className="flex flex-col gap-px">
      <Primitive.Label className="px-2 pt-1.5 pb-1 text-[13px] font-[470] text-[var(--text-tertiary)]">
        {label}
      </Primitive.Label>
      {children}
    </Primitive.Group>
  );
}

export interface DropdownPanelProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  width?: number | string;
  className?: string;
  onOpenAutoFocus?: (event: Event) => void;
}

/** Same surface as `Dropdown` for non-menu content (info cards, pickers, forms). */
export function DropdownPanel({
  trigger,
  children,
  open,
  onOpenChange,
  align = "end",
  side = "bottom",
  sideOffset = 6,
  width,
  className,
  onOpenAutoFocus,
}: DropdownPanelProps) {
  const style = surfaceWidthStyle(width);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-surface-motion=""
          align={align}
          side={side}
          sideOffset={sideOffset}
          collisionPadding={8}
          className={cn(SURFACE_CLASS, className)}
          style={style}
          onClick={stopPortalClick}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Row styling for plain buttons inside a `DropdownPanel`. */
export const DROPDOWN_PANEL_ROW_CLASS =
  "flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[15px] leading-[130%] text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--bg-cell-hover)] focus-visible:bg-[var(--bg-cell-hover)] disabled:pointer-events-none disabled:opacity-40";
