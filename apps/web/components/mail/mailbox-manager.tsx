"use client";

import { useReducer, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Inbox,
  OctagonAlert,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import type { JmapMailbox } from "@/lib/mail/types";
import {
  getMailboxDisplayName,
  sortMailboxesForSidebar,
} from "@/lib/mail/mail-mailbox-roles";
import { useHiddenMailboxIds } from "@/hooks/use-hidden-mailbox-ids";
import {
  PaletteButton,
  PaletteField,
  PaletteFormActions,
  PaletteIconBox,
  PaletteNavRow,
  PaletteSection,
  PaletteView,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  trash: Trash2,
  junk: OctagonAlert,
  spam: OctagonAlert,
};

const PROTECTED_ROLES = new Set(["inbox", "sent", "drafts", "trash", "junk", "spam"]);

function VisibilityToggle({
  name,
  isHidden,
  onToggle,
}: {
  name: string;
  isHidden: boolean;
  onToggle: () => void;
}) {
  const Icon = isHidden ? EyeOff : Eye;
  return (
    <SimpleTooltip content="Show in sidebar">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!isHidden}
        aria-label={`Show ${name} in sidebar`}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Icon className="size-4" />
      </button>
    </SimpleTooltip>
  );
}

function MoveButton({
  direction,
  name,
  onMove,
}: {
  direction: "up" | "down";
  name: string;
  /** Null at the end of the list; the button stays focusable so focus never drops. */
  onMove: (() => void) | null;
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return (
    <SimpleTooltip content={direction === "up" ? "Move up" : "Move down"}>
      <button
        type="button"
        onClick={(event) => {
          if (!onMove) return;
          const button = event.currentTarget;
          onMove();
          // The row's node survives the reorder, but React may detach it while moving it.
          requestAnimationFrame(() => button.focus());
        }}
        aria-disabled={onMove ? undefined : true}
        aria-label={`Move ${name} ${direction}`}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40"
      >
        <Icon className="size-4" />
      </button>
    </SimpleTooltip>
  );
}

function MailboxRow({
  icon: Icon,
  name,
  isHidden,
  onToggleHidden,
  onOpen,
  move,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  isHidden: boolean;
  onToggleHidden?: () => void;
  onOpen?: () => void;
  move?: { up: (() => void) | null; down: (() => void) | null };
}) {
  const content = (
    <>
      <PaletteIconBox>
        <Icon className="size-4" />
      </PaletteIconBox>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[15px] leading-[130%]",
          isHidden ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {name}
      </span>
      {onOpen ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
      ) : null}
    </>
  );
  const bodyClass =
    "flex min-h-11 min-w-0 flex-1 items-center gap-3 py-1.5 pl-2 text-left sm:min-h-9";

  return (
    <div className="flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-muted">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            bodyClass,
            "cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {content}
        </button>
      ) : (
        <div className={bodyClass}>{content}</div>
      )}
      {move ? (
        <>
          <MoveButton direction="up" name={name} onMove={move.up} />
          <MoveButton direction="down" name={name} onMove={move.down} />
        </>
      ) : null}
      {onToggleHidden ? (
        <VisibilityToggle name={name} isHidden={isHidden} onToggle={onToggleHidden} />
      ) : (
        <span className="size-7 shrink-0" />
      )}
    </div>
  );
}

type MailboxFormState = {
  name: string;
  saving: boolean;
  failure: string | null;
  nameMissing: boolean;
  confirmDelete: boolean;
};

function mailboxFormReducer(
  state: MailboxFormState,
  patch: Partial<MailboxFormState>,
): MailboxFormState {
  return { ...state, ...patch };
}

function MailboxForm({
  title,
  initialName,
  submitLabel,
  onBack,
  onSubmit,
  onDelete,
}: {
  title: string;
  initialName: string;
  submitLabel: string;
  onBack: () => void;
  onSubmit?: (name: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [form, patch] = useReducer(mailboxFormReducer, {
    name: initialName,
    saving: false,
    failure: null,
    nameMissing: false,
    confirmDelete: false,
  });
  const { name, saving, failure, nameMissing, confirmDelete } = form;
  const nameInputRef = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();
  const changed = trimmed !== initialName;

  // Handles rejection itself; the returned promise never rejects.
  const run = (action: () => Promise<void>, failureMessage: string): void => {
    patch({ saving: true, failure: null });
    void action()
      .then(() => {
        patch({ saving: false });
        onBack();
      })
      .catch(() => patch({ saving: false, failure: failureMessage }));
  };

  const submit = () => {
    if (!onSubmit || saving) return;
    if (!trimmed) {
      patch({ nameMissing: true });
      nameInputRef.current?.focus();
      return;
    }
    if (changed) {
      run(
        () => onSubmit(trimmed),
        "Mailbox not saved. Check your connection and try again.",
      );
    }
  };

  return (
    <PaletteView title={title} onBack={onBack}>
      {onSubmit ? (
        <PaletteField label="Name" htmlFor="mailbox-name">
          <input
            ref={nameInputRef}
            id="mailbox-name"
            type="text"
            value={name}
            autoComplete="off"
            placeholder="Mailbox name"
            aria-label="Mailbox name"
            aria-invalid={nameMissing || undefined}
            aria-describedby={nameMissing ? "mailbox-name-error" : undefined}
            disabled={saving}
            onChange={(e) => patch({ name: e.target.value, nameMissing: false })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className={PALETTE_INPUT_CLASS}
          />
          {nameMissing ? (
            <p id="mailbox-name-error" className="text-[13px] leading-[130%] text-destructive">
              Enter a mailbox name.
            </p>
          ) : null}
        </PaletteField>
      ) : null}
      <p role="status" className="px-2 pt-2 text-[13px] leading-[130%] text-destructive empty:pt-0">
        {confirmDelete
          ? `Delete “${initialName}”? All messages in it are permanently deleted. You can’t undo this.`
          : null}
      </p>
      {failure ? (
        <p className="px-2 pt-2 text-[13px] leading-[130%] text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
      <PaletteFormActions>
        {onDelete ? (
          <PaletteButton
            variant={confirmDelete ? "destructive" : "ghost"}
            className="mr-auto"
            disabled={saving}
            onClick={() =>
              confirmDelete
                ? run(onDelete, "Mailbox not deleted. Check your connection and try again.")
                : patch({ confirmDelete: true })
            }
          >
            {confirmDelete ? "Delete mailbox" : "Delete mailbox…"}
          </PaletteButton>
        ) : null}
        <PaletteButton
          variant="ghost"
          onClick={confirmDelete ? () => patch({ confirmDelete: false }) : onBack}
          disabled={saving}
        >
          {confirmDelete ? "Keep mailbox" : "Cancel"}
        </PaletteButton>
        {onSubmit ? (
          <PaletteButton variant="primary" loading={saving} disabled={!changed} onClick={submit}>
            {submitLabel}
          </PaletteButton>
        ) : null}
      </PaletteFormActions>
    </PaletteView>
  );
}

interface MailboxManagerProps {
  mailboxes: JmapMailbox[];
  currentView: string;
  onBack: () => void;
  onNavigateTo: (view: string) => void;
  onCreateMailbox: (name: string) => Promise<void>;
  onDeleteMailbox: (id: string) => Promise<void>;
  onRenameMailbox?: (id: string, name: string) => Promise<void>;
  onReorderMailboxes?: (reordered: JmapMailbox[]) => void;
}

export function MailboxManager({
  mailboxes,
  currentView,
  onBack,
  onNavigateTo,
  onCreateMailbox,
  onDeleteMailbox,
  onRenameMailbox,
  onReorderMailboxes,
}: MailboxManagerProps) {
  const [editingMailboxId, setEditingMailboxId] = useState<string | null>(null);
  const { hiddenIds, toggleHidden } = useHiddenMailboxIds();
  const editingMailbox = mailboxes.find((m) => m.id === editingMailboxId);

  if (currentView === "mailbox-create") {
    return (
      <MailboxForm
        title="New mailbox"
        initialName=""
        submitLabel="Create"
        onBack={onBack}
        onSubmit={onCreateMailbox}
      />
    );
  }

  if (currentView === "mailbox-edit" && editingMailbox) {
    return (
      <MailboxForm
        key={editingMailbox.id}
        title={editingMailbox.name}
        initialName={editingMailbox.name}
        submitLabel="Save"
        onBack={onBack}
        onSubmit={
          onRenameMailbox
            ? (name) => onRenameMailbox(editingMailbox.id, name)
            : undefined
        }
        onDelete={() => onDeleteMailbox(editingMailbox.id)}
      />
    );
  }

  if (currentView !== "mailboxes") return null;

  const isProtected = (m: JmapMailbox) => PROTECTED_ROLES.has(m.role?.toLowerCase() ?? "");
  const sorted = sortMailboxesForSidebar(mailboxes);
  const systemMailboxes = sorted.filter(isProtected);
  const customMailboxes = sorted.filter((m) => !isProtected(m));
  // Moves past the neighbouring mailbox in the same section, as dropping onto it in the sidebar does.
  const moveTo = (
    reorder: (reordered: JmapMailbox[]) => void,
    mailbox: JmapMailbox,
    neighbour: JmapMailbox | undefined,
  ) =>
    neighbour
      ? () =>
          reorder(
            arrayMove(sorted, sorted.indexOf(mailbox), sorted.indexOf(neighbour)),
          )
      : null;
  const moveWithin = (section: JmapMailbox[], mailbox: JmapMailbox, index: number) =>
    onReorderMailboxes
      ? {
          up: moveTo(onReorderMailboxes, mailbox, section[index - 1]),
          down: moveTo(onReorderMailboxes, mailbox, section[index + 1]),
        }
      : undefined;

  return (
    <PaletteView title="Mailboxes" onBack={onBack}>
      <PaletteSection>
        <PaletteNavRow
          icon={Plus}
          label="New mailbox"
          trailing={null}
          onClick={() => onNavigateTo("mailbox-create")}
        />
      </PaletteSection>
      {systemMailboxes.length > 0 ? (
        <PaletteSection label="System">
          {systemMailboxes.map((mailbox, index) => {
            const role = mailbox.role?.toLowerCase() ?? "";
            return (
              <MailboxRow
                key={mailbox.id}
                icon={ROLE_ICONS[role] ?? Folder}
                name={getMailboxDisplayName(mailbox)}
                isHidden={hiddenIds.includes(mailbox.id)}
                onToggleHidden={role === "inbox" ? undefined : () => toggleHidden(mailbox.id)}
                move={moveWithin(systemMailboxes, mailbox, index)}
              />
            );
          })}
        </PaletteSection>
      ) : null}
      {customMailboxes.length > 0 ? (
        <PaletteSection label="Custom">
          {customMailboxes.map((mailbox, index) => (
            <MailboxRow
              key={mailbox.id}
              icon={Folder}
              name={mailbox.name}
              isHidden={hiddenIds.includes(mailbox.id)}
              onToggleHidden={() => toggleHidden(mailbox.id)}
              move={moveWithin(customMailboxes, mailbox, index)}
              onOpen={() => {
                setEditingMailboxId(mailbox.id);
                onNavigateTo("mailbox-edit");
              }}
            />
          ))}
        </PaletteSection>
      ) : null}
    </PaletteView>
  );
}
