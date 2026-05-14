"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createElement, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  Archive,
  AlertTriangle,
  Mail,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  GripVertical,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Check,
  Settings2,
  EyeOff,
  Eye,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@workspace/ui/components/ui/sidebar";
import { Button } from "@workspace/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import { NavUser } from "@workspace/ui/components/navigation";
import { Logo } from "@workspace/ui/components/layout";
import type { JmapMailbox } from "@/lib/mail/types";
import type { ActiveMailboxState } from "@/hooks/use-mail-app";

const ROLE_ORDER = [
  "inbox",
  "sent",
  "drafts",
  "archive",
  "junk",
  "spam",
  "trash",
];
const PROTECTED_ROLES = new Set([
  "inbox",
  "sent",
  "drafts",
  "trash",
  "junk",
  "spam",
]);

export function getMailboxIcon(role: string | null | undefined): LucideIcon {
  switch (role?.toLowerCase()) {
    case "inbox":
      return Inbox;
    case "sent":
      return Send;
    case "drafts":
      return FileText;
    case "trash":
      return Trash2;
    case "archive":
      return Archive;
    case "junk":
    case "spam":
      return AlertTriangle;
    default:
      return Mail;
  }
}

function SidebarIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-lg text-muted-foreground/70 hover:bg-muted/80 hover:text-foreground transition-colors"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function MailboxIcon({
  role,
  isSelected,
  className,
}: {
  role?: string | null;
  isSelected: boolean;
  className?: string;
}) {
  return createElement(getMailboxIcon(role), {
    size: 15,
    strokeWidth: isSelected ? 2.5 : 2,
    className,
  });
}

function SortableMailboxItem({
  mailbox,
  isSelected,
  isBusy,
  onSelect,
  isHideable,
  onHideClick,
}: {
  mailbox: JmapMailbox;
  isSelected: boolean;
  isBusy: boolean;
  onSelect: () => void;
  isHideable: boolean;
  onHideClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mailbox.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={style}
      className="group/item relative"
    >
      <button
        type="button"
        className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-8 flex items-center justify-center opacity-0 group-hover/item:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/70 transition-all z-10"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={12} strokeWidth={2} />
      </button>

      <SidebarMenuButton
        className={`rounded-lg h-8 text-[13px] font-medium transition-colors pl-5 ${
          isHideable ? "pr-7" : ""
        } ${
          isSelected
            ? "text-foreground bg-muted/70"
            : "text-muted-foreground/60 hover:bg-muted/40 hover:text-muted-foreground/90"
        }`}
        onClick={onSelect}
      >
        <MailboxIcon role={mailbox.role} isSelected={isSelected} />
        <span className="truncate">{mailbox.name}</span>
      </SidebarMenuButton>

      {isHideable && (
        <button
          type="button"
          onClick={onHideClick}
          disabled={isBusy}
          aria-label={`Hide ${mailbox.name}`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 h-5 w-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-all disabled:opacity-30"
        >
          <EyeOff size={11} strokeWidth={2.5} />
        </button>
      )}
    </SidebarMenuItem>
  );
}

export interface MailSidebarProps {
  user: { name: string; email: string; avatar?: string };
  activeMailbox: ActiveMailboxState | null;
  onSelectMailbox: (mailboxId: string) => void;
  onCompose: () => void;
  onOpenPalette: () => void;
  onOpenMailboxes: () => void;
  onSignOut: () => void;
  onReorderMailboxes: (reordered: JmapMailbox[]) => void;
  isBusy: boolean;
}

export function MailSidebar({
  user,
  activeMailbox,
  onSelectMailbox,
  onCompose,
  onOpenPalette,
  onOpenMailboxes,
  onSignOut,
  onReorderMailboxes,
  isBusy,
}: MailSidebarProps) {
  const { state, toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const isCollapsed = state === "collapsed";
  const activeApp = pathname?.startsWith("/calendar") ? "calendar" : "mail";
  const [hiddenMailboxIds, setHiddenMailboxIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("mail:hiddenMailboxIds");
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const sorted = activeMailbox
    ? [...activeMailbox.mailboxes].sort((a, b) => {
        if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
          return a.sortOrder - b.sortOrder;
        }
        const ai = ROLE_ORDER.indexOf(a.role?.toLowerCase() ?? "");
        const bi = ROLE_ORDER.indexOf(b.role?.toLowerCase() ?? "");
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
    : [];

  const visibleItems = sorted.filter((m) => !hiddenMailboxIds.has(m.id));
  const hiddenItems = sorted.filter((m) => hiddenMailboxIds.has(m.id));

  function toggleHide(id: string) {
    setHiddenMailboxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(
          "mail:hiddenMailboxIds",
          JSON.stringify([...next]),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((m) => m.id === active.id);
    const newIndex = sorted.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    onReorderMailboxes(reordered);
  }

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader
        className={
          isCollapsed ? "items-center pt-4 px-2 pb-3" : "pt-4 px-4 pb-3"
        }
      >
        {isCollapsed ? (
          <>
            <Link className="inline-flex justify-center" href="/">
              <Logo width="28" height="28" className="text-primary" />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={16} strokeWidth={2} />
            </Button>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg px-1.5 py-1 -ml-1.5 hover:bg-muted/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <Logo
                    width="26"
                    height="26"
                    className="text-primary shrink-0"
                  />
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-[15px] tracking-[-0.04em] text-foreground"
                      style={{ fontWeight: 380 }}
                    >
                      solace
                    </span>
                    <span className="text-[12px] font-medium text-muted-foreground/55 tracking-[-0.01em]">
                      mail
                    </span>
                  </div>
                  <ChevronDown
                    className="h-3 w-3 text-muted-foreground/40 shrink-0"
                    strokeWidth={2.5}
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                className="w-44"
              >
                <DropdownMenuItem asChild>
                  <Link href="/calendar" className="flex items-center gap-2.5">
                    <CalendarDays
                      className="h-4 w-4 text-muted-foreground shrink-0"
                      strokeWidth={2}
                    />
                    Calendar
                    {activeApp === "calendar" ? (
                      <Check
                        className="ml-auto h-3.5 w-3.5 text-primary shrink-0"
                        strokeWidth={2.5}
                      />
                    ) : null}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/mail" className="flex items-center gap-2.5">
                    <Mail
                      className="h-4 w-4 text-muted-foreground shrink-0"
                      strokeWidth={2}
                    />
                    Mail
                    {activeApp === "mail" ? (
                      <Check
                        className="ml-auto h-3.5 w-3.5 text-primary shrink-0"
                        strokeWidth={2.5}
                      />
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={16} strokeWidth={2} />
            </Button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0 flex flex-col overflow-hidden">
        <SidebarGroup
          className={`px-2 shrink-0 ${isCollapsed ? "pt-2" : "pt-1"}`}
        >
          {isCollapsed ? (
            <SidebarGroupContent className="flex flex-col items-center">
              <SidebarIconButton label="Compose" onClick={onCompose}>
                <Plus size={18} strokeWidth={2.5} className="text-primary" />
              </SidebarIconButton>
            </SidebarGroupContent>
          ) : (
            <SidebarGroupContent>
              <Button
                onClick={onCompose}
                variant="outline"
                className="w-full h-9 rounded-xl border-border/60 text-foreground/80 font-medium text-[13px] hover:bg-muted/60 hover:text-foreground transition-colors"
                style={{ fontWeight: 470 }}
              >
                <Plus size={15} strokeWidth={2} />
                Compose
              </Button>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {activeMailbox && (
          <SidebarGroup
            className={`px-2 flex-1 overflow-y-auto ${isCollapsed ? "pt-2" : "pt-3"}`}
          >
            {isCollapsed ? (
              <SidebarGroupContent className="flex flex-col items-center gap-1">
                {sorted.map((mailbox) => {
                  if (hiddenMailboxIds.has(mailbox.id)) return null;
                  const isSelected =
                    activeMailbox.selectedMailboxId === mailbox.id;
                  return (
                    <SidebarMenuItem
                      key={mailbox.id}
                      className="flex justify-center list-none"
                    >
                      <SidebarIconButton
                        label={mailbox.name}
                        onClick={() => onSelectMailbox(mailbox.id)}
                      >
                        <MailboxIcon
                          role={mailbox.role}
                          isSelected={isSelected}
                          className={
                            isSelected
                              ? "text-foreground"
                              : "text-muted-foreground/60"
                          }
                        />
                      </SidebarIconButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarGroupContent>
            ) : (
              <>
                <div className="px-2 mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                    Mailboxes
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={onOpenMailboxes}
                        disabled={isBusy}
                        aria-label="Mailbox settings"
                        className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40"
                      >
                        <Settings2 size={13} strokeWidth={2.25} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      Mailbox settings
                    </TooltipContent>
                  </Tooltip>
                </div>
                <SidebarGroupContent>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[
                      restrictToVerticalAxis,
                      restrictToParentElement,
                    ]}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={visibleItems.map((m) => m.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <SidebarMenu className="gap-0.5">
                        {visibleItems.map((mailbox) => {
                          const isInbox =
                            mailbox.role?.toLowerCase() === "inbox";
                          return (
                            <SortableMailboxItem
                              key={mailbox.id}
                              mailbox={mailbox}
                              isSelected={
                                activeMailbox.selectedMailboxId === mailbox.id
                              }
                              isBusy={isBusy}
                              onSelect={() => onSelectMailbox(mailbox.id)}
                              isHideable={!isInbox}
                              onHideClick={() => toggleHide(mailbox.id)}
                            />
                          );
                        })}
                      </SidebarMenu>
                    </SortableContext>
                  </DndContext>

                  {hiddenItems.length > 0 && (
                    <div className="mt-1">
                      <button
                        type="button"
                        onClick={() => setHiddenExpanded((v) => !v)}
                        className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-muted/30 transition-colors"
                      >
                        <ChevronRight
                          size={11}
                          strokeWidth={2.5}
                          className={`transition-transform ${hiddenExpanded ? "rotate-90" : ""}`}
                        />
                        <span>{hiddenItems.length} hidden</span>
                      </button>
                      {hiddenExpanded && (
                        <SidebarMenu className="gap-0.5 mt-0.5">
                          {hiddenItems.map((mailbox) => {
                            const isSelected =
                              activeMailbox.selectedMailboxId === mailbox.id;
                            return (
                              <SidebarMenuItem
                                key={mailbox.id}
                                className="group/hidden relative"
                              >
                                <SidebarMenuButton
                                  className={`rounded-lg h-8 text-[13px] font-medium transition-colors pl-5 pr-7 opacity-50 ${
                                    isSelected
                                      ? "text-foreground bg-muted/70"
                                      : "text-muted-foreground/60 hover:bg-muted/40 hover:text-muted-foreground/90"
                                  }`}
                                  onClick={() => onSelectMailbox(mailbox.id)}
                                >
                                  <MailboxIcon
                                    role={mailbox.role}
                                    isSelected={isSelected}
                                  />
                                  <span className="truncate">
                                    {mailbox.name}
                                  </span>
                                </SidebarMenuButton>
                                <button
                                  type="button"
                                  onClick={() => toggleHide(mailbox.id)}
                                  aria-label={`Show ${mailbox.name}`}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/hidden:opacity-100 h-5 w-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-all"
                                >
                                  <Eye size={11} strokeWidth={2.5} />
                                </button>
                              </SidebarMenuItem>
                            );
                          })}
                        </SidebarMenu>
                      )}
                    </div>
                  )}
                </SidebarGroupContent>
              </>
            )}
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-border/40">
        <NavUser
          user={user}
          onLogout={onSignOut}
          onOpenSettings={onOpenPalette}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
