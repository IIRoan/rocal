"use client";

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
  Settings2,
  Search,
  Settings,
  SquarePen,
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
  SidebarIconButton,
} from "@workspace/ui/components/layout";
import type { JmapMailbox, LabelDef } from "@/lib/mail/types";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
import type { ActiveMailboxState } from "@/hooks/use-mail-app";
import { useHiddenMailboxIds } from "@/hooks/use-hidden-mailbox-ids";
import { MailSidebarLabels } from "./mail-sidebar-labels";

const EMPTY_LABELS: LabelDef[] = [];

const ROLE_ORDER = [
  "inbox",
  "sent",
  "drafts",
  "archive",
  "junk",
  "spam",
  "trash",
];
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
    size: 16,
    strokeWidth: isSelected ? 2.25 : 2,
    className,
  });
}

function SortableMailboxItem({
  mailbox,
  isSelected,
  onSelect,
}: {
  mailbox: JmapMailbox;
  isSelected: boolean;
  onSelect: () => void;
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
        className={`rounded-md h-8 text-[15px] font-[380] transition-colors pl-2 ${
          isSelected
            ? "text-[var(--text-primary)] bg-[var(--bg-overlay-tertiary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-overlay-tertiary)] hover:text-[var(--text-primary)]"
        }`}
        onClick={onSelect}
      >
        <MailboxIcon role={mailbox.role} isSelected={isSelected} />
        <span className="truncate">{getMailboxDisplayName(mailbox)}</span>
      </SidebarMenuButton>

    </SidebarMenuItem>
  );
}

function ExpandedMailboxNav({
  visibleItems,
  sensors,
  onDragEnd,
  isBusy,
  activeLabelId,
  selectedMailboxId,
  onSelectMailbox,
  onOpenMailboxes,
  labels,
  onSelectLabel,
  onOpenLabels,
}: {
  visibleItems: JmapMailbox[];
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  isBusy: boolean;
  activeLabelId: string | null;
  selectedMailboxId: string | null;
  onSelectMailbox: (mailboxId: string) => void;
  onOpenMailboxes: () => void;
  labels: LabelDef[];
  onSelectLabel?: (labelId: string) => void;
  onOpenLabels?: () => void;
}) {
  return (
    <>
      <div className="px-2 mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-[470] text-[var(--text-tertiary)]">
          Mail
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
          <TooltipContent side="right">Mailbox settings</TooltipContent>
        </Tooltip>
      </div>
      <SidebarGroupContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={visibleItems.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <SidebarMenu className="gap-0.5">
              {visibleItems.map((mailbox) => (
                <SortableMailboxItem
                  key={mailbox.id}
                  mailbox={mailbox}
                  isSelected={
                    !activeLabelId && selectedMailboxId === mailbox.id
                  }
                  onSelect={() => onSelectMailbox(mailbox.id)}
                />
              ))}
            </SidebarMenu>
          </SortableContext>
        </DndContext>

        {onSelectLabel ? (
          <MailSidebarLabels
            labels={labels}
            activeLabelId={activeLabelId}
            isBusy={isBusy}
            onSelectLabel={onSelectLabel}
            onOpenLabels={onOpenLabels}
          />
        ) : null}
      </SidebarGroupContent>
    </>
  );
}

function MailPrimaryActions({
  isCollapsed,
  onCompose,
  onOpenSearch,
  onOpenSettings,
}: {
  isCollapsed: boolean;
  onCompose: () => void;
  onOpenSearch?: () => void;
  onOpenSettings: () => void;
}) {
  if (isCollapsed) {
    return (
      <SidebarGroup className="shrink-0 items-center gap-1 px-2 pt-2">
        <SidebarIconButton
          label="Compose"
          onClick={onCompose}
          className="bg-[var(--bg-l3-solid)] text-[var(--icon-primary)] shadow-[var(--shadow-primary-action)] hover:bg-[var(--bg-l3-solid)] hover:shadow-[var(--shadow-primary-action-hover)]"
        >
          <SquarePen size={16} strokeWidth={2} />
        </SidebarIconButton>
        {onOpenSearch ? (
          <SidebarIconButton label="Search" onClick={onOpenSearch}>
            <Search size={16} strokeWidth={2} />
          </SidebarIconButton>
        ) : null}
      </SidebarGroup>
    );
  }

  const rowClassName =
    "h-8 rounded-md pl-2 text-[15px] font-[380] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-cell-hover)] hover:text-[var(--text-primary)]";

  return (
    <SidebarGroup className="shrink-0 border-b border-[var(--border-tertiary)] px-1.5 pt-1 pb-3">
      <SidebarMenu className="gap-1">
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={onCompose}
            className="h-9 rounded-md bg-[var(--bg-l3-solid)] pl-2 text-[15px] font-[380] text-[var(--text-primary)] shadow-[var(--shadow-primary-action)] transition-shadow hover:bg-[var(--bg-l3-solid)] hover:text-[var(--text-primary)] hover:shadow-[var(--shadow-primary-action-hover)] active:bg-[var(--bg-l3-solid)]"
          >
            <SquarePen size={16} strokeWidth={2} />
            <span>Compose</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {onOpenSearch ? (
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenSearch} className={rowClassName}>
              <Search size={16} strokeWidth={2} />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        <SidebarMenuItem>
          <SidebarMenuButton onClick={onOpenSettings} className={rowClassName}>
            <Settings size={16} strokeWidth={2} />
            <span>Settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
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
  labels?: LabelDef[];
  activeLabelId?: string | null;
  onSelectLabel?: (labelId: string) => void;
  onOpenLabels?: () => void;
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
  labels = EMPTY_LABELS,
  activeLabelId = null,
  onSelectLabel,
  onOpenLabels,
}: MailSidebarProps) {
  const { hiddenIds } = useHiddenMailboxIds();

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

  const visibleItems = sorted.filter((m) => !hiddenIds.includes(m.id));

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
      variant="sidebar"
      user={user}
      onLogout={onSignOut}
      onOpenSettings={onOpenPalette}
    >
      {({ isCollapsed }) => (
        <>
          <MailPrimaryActions
            isCollapsed={isCollapsed}
            onCompose={onCompose}
            onOpenSearch={onOpenSearch}
            onOpenSettings={onOpenPalette}
          />

          {activeMailbox && (
            <SidebarGroup
              className={`px-2 flex-1 overflow-y-auto ${isCollapsed ? "pt-2" : "pt-3"}`}
            >
            {isCollapsed ? (
              <SidebarGroupContent className="flex flex-col items-center gap-1">
                {visibleItems.map((mailbox) => {
                  const isSelected =
                    !activeLabelId &&
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
              <ExpandedMailboxNav
                visibleItems={visibleItems}
                sensors={sensors}
                onDragEnd={handleDragEnd}
                isBusy={isBusy}
                activeLabelId={activeLabelId}
                selectedMailboxId={activeMailbox.selectedMailboxId}
                onSelectMailbox={onSelectMailbox}
                onOpenMailboxes={onOpenMailboxes}
                labels={labels}
                onSelectLabel={onSelectLabel}
                onOpenLabels={onOpenLabels}
              />
            )}
            </SidebarGroup>
          )}
        </>
      )}
    </SidebarShell>
  );
}
