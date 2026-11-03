"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
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
import {
  getMailboxDisplayName,
  sortMailboxesForSidebar,
} from "@/lib/mail/mail-mailbox-roles";
import type { ActiveMailboxState } from "@/hooks/use-mail-app";
import { useHiddenMailboxIds } from "@/hooks/use-hidden-mailbox-ids";
import { MailSidebarLabels, TruncatedNameTooltip } from "./mail-sidebar-labels";

const EMPTY_LABELS: LabelDef[] = [];

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

  const name = getMailboxDisplayName(mailbox);

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={style}
      className="group/item relative"
    >
      <button
        type="button"
        className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-8 flex items-center justify-center opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-[opacity,color] z-10"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${name}`}
      >
        <GripVertical size={12} strokeWidth={2} />
      </button>

      <TruncatedNameTooltip name={name}>
        <SidebarMenuButton
          isActive={isSelected}
          aria-current={isSelected ? "page" : undefined}
          onClick={onSelect}
        >
          <MailboxIcon role={mailbox.role} isSelected={isSelected} />
          <span data-sidebar-name className="truncate">
            {name}
          </span>
        </SidebarMenuButton>
      </TruncatedNameTooltip>
    </SidebarMenuItem>
  );
}

function mailboxReorderAnnouncements(mailboxes: JmapMailbox[]): Announcements {
  const nameOf = (id: UniqueIdentifier) => {
    const mailbox = mailboxes.find((entry) => entry.id === id);
    return mailbox ? getMailboxDisplayName(mailbox) : "Mailbox";
  };
  return {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} is over ${nameOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} moved to the place of ${nameOf(over.id)}.`
        : `${nameOf(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Reordering ${nameOf(active.id)} cancelled.`,
  };
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
      <div data-sidebar-heading className="justify-between">
        <h2 className="font-medium tracking-normal">General</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenMailboxes}
              disabled={isBusy}
              aria-label="Mailbox settings"
              className="flex size-6 cursor-pointer items-center justify-center rounded-md text-[var(--icon-tertiary)] transition-colors hover:bg-[var(--bg-cell-hover)] hover:text-[var(--icon-primary)] disabled:opacity-40"
            >
              <Settings2 size={14} strokeWidth={2} />
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
          accessibility={{
            announcements: mailboxReorderAnnouncements(visibleItems),
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={visibleItems.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <SidebarMenu className="gap-1">
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
        <SidebarIconButton label="Compose" onClick={onCompose}>
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

  return (
    <SidebarGroup className="shrink-0 px-2 pt-1">
      <SidebarMenu className="gap-1">
        <SidebarMenuItem>
          <SidebarMenuButton onClick={onCompose}>
            <SquarePen size={16} strokeWidth={2} />
            <span>Compose</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {onOpenSearch ? (
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenSearch}>
              <Search size={16} strokeWidth={2} />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        <SidebarMenuItem>
          <SidebarMenuButton onClick={onOpenSettings}>
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
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sorted = activeMailbox
    ? sortMailboxesForSidebar(activeMailbox.mailboxes)
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
              className={`px-2 flex-1 overflow-y-auto ${isCollapsed ? "pt-2" : "pt-4"}`}
            >
            <nav aria-label="Mailboxes">
            {isCollapsed ? (
              <SidebarMenu className="items-center">
                {visibleItems.map((mailbox) => {
                  const isSelected =
                    !activeLabelId &&
                    activeMailbox.selectedMailboxId === mailbox.id;
                  return (
                    <SidebarMenuItem
                      key={mailbox.id}
                      className="flex justify-center"
                    >
                      <SidebarIconButton
                        label={getMailboxDisplayName(mailbox)}
                        onClick={() => onSelectMailbox(mailbox.id)}
                        aria-current={isSelected ? "page" : undefined}
                        className={
                          isSelected
                            ? "bg-hover text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        <MailboxIcon
                          role={mailbox.role}
                          isSelected={isSelected}
                        />
                      </SidebarIconButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
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
            </nav>
            </SidebarGroup>
          )}
        </>
      )}
    </SidebarShell>
  );
}
