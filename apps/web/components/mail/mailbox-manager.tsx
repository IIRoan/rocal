"use client";

import { useState } from "react";
import {
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
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
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
    <SimpleTooltip content={isHidden ? "Show in sidebar" : "Hide from sidebar"}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!isHidden}
        aria-label={isHidden ? `Show ${name} in sidebar` : `Hide ${name} from sidebar`}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  isHidden: boolean;
  onToggleHidden?: () => void;
  onOpen?: () => void;
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
        <button type="button" onClick={onOpen} className={cn(bodyClass, "cursor-pointer outline-none")}>
          {content}
        </button>
      ) : (
        <div className={bodyClass}>{content}</div>
      )}
      {onToggleHidden ? (
        <VisibilityToggle name={name} isHidden={isHidden} onToggle={onToggleHidden} />
      ) : (
        <span className="size-7 shrink-0" />
      )}
    </div>
  );
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
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
  const saving = status === "saving";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const trimmed = name.trim();
  const canSave = Boolean(onSubmit) && trimmed.length > 0 && trimmed !== initialName && !saving;

  const run = (action: () => Promise<void>) => {
    setStatus("saving");
    return action()
      .then(() => {
        setStatus("idle");
        onBack();
      })
      .catch(() => setStatus("failed"));
  };

  const submit = () => {
    if (canSave && onSubmit) void run(() => onSubmit(trimmed));
  };

  return (
    <PaletteView title={title} onBack={onBack}>
      {onSubmit ? (
        <PaletteField label="Name" htmlFor="mailbox-name">
          <input
            id="mailbox-name"
            type="text"
            value={name}
            autoComplete="off"
            placeholder="Mailbox name"
            aria-label="Mailbox name"
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className={PALETTE_INPUT_CLASS}
          />
        </PaletteField>
      ) : null}
      {confirmDelete ? (
        <p className="px-2 pt-2 text-[13px] leading-[130%] text-destructive">
          All messages inside {initialName} will be permanently removed.
        </p>
      ) : null}
      {status === "failed" ? (
        <p className="px-2 pt-2 text-[13px] leading-[130%] text-destructive" role="alert">
          Something went wrong. Please try again.
        </p>
      ) : null}
      <PaletteFormActions>
        {onDelete ? (
          <PaletteButton
            variant={confirmDelete ? "destructive" : "ghost"}
            className="mr-auto"
            disabled={saving}
            onClick={() => (confirmDelete ? void run(onDelete) : setConfirmDelete(true))}
          >
            {confirmDelete ? "Confirm delete" : "Delete mailbox"}
          </PaletteButton>
        ) : null}
        <PaletteButton variant="ghost" onClick={onBack} disabled={saving}>
          Cancel
        </PaletteButton>
        {onSubmit ? (
          <PaletteButton variant="primary" loading={saving} disabled={!canSave} onClick={submit}>
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
}

export function MailboxManager({
  mailboxes,
  currentView,
  onBack,
  onNavigateTo,
  onCreateMailbox,
  onDeleteMailbox,
  onRenameMailbox,
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
  const systemMailboxes = mailboxes.filter(isProtected);
  const customMailboxes = mailboxes.filter((m) => !isProtected(m));

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
          {systemMailboxes.map((mailbox) => {
            const role = mailbox.role?.toLowerCase() ?? "";
            return (
              <MailboxRow
                key={mailbox.id}
                icon={ROLE_ICONS[role] ?? Folder}
                name={getMailboxDisplayName(mailbox)}
                isHidden={hiddenIds.includes(mailbox.id)}
                onToggleHidden={role === "inbox" ? undefined : () => toggleHidden(mailbox.id)}
              />
            );
          })}
        </PaletteSection>
      ) : null}
      {customMailboxes.length > 0 ? (
        <PaletteSection label="Custom">
          {customMailboxes.map((mailbox) => (
            <MailboxRow
              key={mailbox.id}
              icon={Folder}
              name={mailbox.name}
              isHidden={hiddenIds.includes(mailbox.id)}
              onToggleHidden={() => toggleHidden(mailbox.id)}
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
