"use client";

import { useState } from "react";
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
  OctagonAlert,
  Mail,
  GripVertical,
  ChevronRight,
  Settings2,
  EyeOff,
  Eye,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createElement } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import {
  SidebarShell,
  SidebarPrimaryAction,
  SidebarIconButton,
} from "@workspace/ui/components/layout";
import type { JmapMailbox } from "@/lib/mail/types";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
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
const HIDDEN_MAILBOX_IDS_STORAGE_KEY = "mail:hiddenMailboxIds:v1";
const LEGACY_HIDDEN_MAILBOX_IDS_STORAGE_KEY = "mail:hiddenMailboxIds";

function readHiddenMailboxIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    let stored = localStorage.getItem(HIDDEN_MAILBOX_IDS_STORAGE_KEY);
    if (!stored) {
      stored = localStorage.getItem(LEGACY_HIDDEN_MAILBOX_IDS_STORAGE_KEY);
      if (stored) {
        localStorage.setItem(HIDDEN_MAILBOX_IDS_STORAGE_KEY, stored);
        localStorage.removeItem(LEGACY_HIDDEN_MAILBOX_IDS_STORAGE_KEY);
      }
    }
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}
const PROTECTED_ROLES = new Set([
  "inbox",
  "sent",
  "drafts",
  "trash",
  "junk",
  "spam",
]);

function getMailboxIcon(role: string | null | undefined): LucideIcon {
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
      return OctagonAlert;
    default:
      return Mail;
  }
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
        className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-8 flex items-center justify-center opacity-0 group-hover/item:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/70 transition-[opacity,color] z-10"
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
        <span className="truncate">{getMailboxDisplayName(mailbox)}</span>
      </SidebarMenuButton>

      {isHideable && (
        <button
          type="button"
          onClick={onHideClick}
          disabled={isBusy}
          aria-label={`Hide ${getMailboxDisplayName(mailbox)}`}
          className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 h-8 w-8 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-[opacity,color,background-color] disabled:opacity-30"
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
  onOpenSearch?: () => void;
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
  onOpenSearch,
  onOpenMailboxes,
  onSignOut,
  onReorderMailboxes,
  isBusy,
}: MailSidebarProps) {
  const [hiddenMailboxIds, setHiddenMailboxIds] = useState<Set<string>>(
    readHiddenMailboxIds,
  );
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const sorted = activeMailbox
    ? Array.from(activeMailbox.mailboxes).sort((a, b) => {
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
          HIDDEN_MAILBOX_IDS_STORAGE_KEY,
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
    <SidebarShell
      activeApp="mail"
      onOpenSearch={onOpenSearch}
      user={user}
      onLogout={onSignOut}
      onOpenSettings={onOpenPalette}
    >
      {({ isCollapsed }) => (
        <>
          <SidebarPrimaryAction label="Compose" onClick={onCompose} />

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
                        label={getMailboxDisplayName(mailbox)}
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
                        className="size-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40"
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
                                    {getMailboxDisplayName(mailbox)}
                                  </span>
                                </SidebarMenuButton>
                                <button
                                  type="button"
                                  onClick={() => toggleHide(mailbox.id)}
                                  aria-label={`Show ${getMailboxDisplayName(mailbox)}`}
                                  className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/hidden:opacity-100 h-8 w-8 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-[opacity,color,background-color]"
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
        </>
      )}
    </SidebarShell>
  );
}
