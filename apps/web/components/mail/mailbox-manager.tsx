"use client";

import { useState, useRef } from "react";
import {
  ArrowLeft,
  Plus,
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertOctagon,
  Folder,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { JmapMailbox } from "@/lib/mail/types";

const ROLE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  trash: Trash2,
  junk: AlertOctagon,
  spam: AlertOctagon,
};

const PROTECTED_ROLES = new Set([
  "inbox",
  "sent",
  "drafts",
  "trash",
  "junk",
  "spam",
]);

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
  const [editingMailbox, setEditingMailbox] = useState<JmapMailbox | null>(
    null,
  );
  const [newName, setNewName] = useState("");
  const [createName, setCreateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const systemMailboxes = mailboxes.filter((m) =>
    PROTECTED_ROLES.has(m.role?.toLowerCase() ?? ""),
  );
  const customMailboxes = mailboxes.filter(
    (m) => !PROTECTED_ROLES.has(m.role?.toLowerCase() ?? ""),
  );

  if (currentView === "mailboxes") {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium">Mailboxes</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="p-1 mb-1">
            <button
              type="button"
              onClick={() => {
                setCreateName("");
                onNavigateTo("mailbox-create");
              }}
              className="flex items-center gap-3 p-2 w-full rounded-md text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors"
            >
              <div className="flex items-center justify-center size-6 shrink-0">
                <Plus className="size-4 text-primary" />
              </div>
              <span className="text-sm text-primary font-medium flex-1">
                Create New Mailbox
              </span>
            </button>
          </div>

          {systemMailboxes.length > 0 && (
            <>
              <div className="px-1 pb-1 pt-2 border-t border-border/40">
                <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-2">
                  System
                </span>
              </div>
              <div className="p-1">
                {systemMailboxes.map((mailbox) => {
                  const role = mailbox.role?.toLowerCase() ?? "";
                  const Icon = ROLE_ICONS[role] ?? Folder;
                  return (
                    <div
                      key={mailbox.id}
                      className="flex items-center gap-3 p-2 w-full rounded-md text-left opacity-60 cursor-default"
                    >
                      <div className="flex items-center justify-center size-6 shrink-0">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <span className="text-sm flex-1">{mailbox.name}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {customMailboxes.length > 0 && (
            <>
              <div className="px-1 pb-1 pt-2 border-t border-border/40">
                <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase px-2">
                  Custom
                </span>
              </div>
              <div className="p-1">
                {customMailboxes.map((mailbox) => (
                  <button
                    key={mailbox.id}
                    type="button"
                    onClick={() => {
                      setEditingMailbox(mailbox);
                      setNewName(mailbox.name);
                      setConfirmDelete(false);
                      onNavigateTo("mailbox-edit");
                    }}
                    className="flex items-center gap-3 p-2 w-full rounded-md text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors group"
                  >
                    <div className="flex items-center justify-center size-6 shrink-0">
                      <Folder className="size-4 text-muted-foreground" />
                    </div>
                    <span className="text-sm flex-1">{mailbox.name}</span>
                    <ChevronRight className="size-4 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (currentView === "mailbox-create") {
    const canSave = createName.trim().length > 0 && !saving;
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium">New Mailbox</span>
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-4">
          <div className="mb-3">
            <label
              htmlFor="create-mailbox-name"
              className="text-xs font-medium text-muted-foreground block mb-1.5"
            >
              Name
            </label>
            <input
              id="create-mailbox-name"
              ref={createInputRef}
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) {
                  e.preventDefault();
                  void (async () => {
                    setSaving(true);
                    try {
                      await onCreateMailbox(createName.trim());
                      setCreateName("");
                      onBack();
                    } finally {
                      setSaving(false);
                    }
                  })();
                }
              }}
              placeholder="Mailbox name"
              className="w-full rounded-md bg-muted/50 border border-border/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={async () => {
                setSaving(true);
                try {
                  await onCreateMailbox(createName.trim());
                  setCreateName("");
                  onBack();
                } finally {
                  setSaving(false);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === "mailbox-edit" && editingMailbox) {
    const canSave =
      newName.trim().length > 0 &&
      newName.trim() !== editingMailbox.name &&
      !saving;
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              onBack();
            }}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium truncate">
            {editingMailbox.name}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-4">
          {onRenameMailbox && (
            <div className="mb-3">
              <label
                htmlFor="edit-mailbox-name"
                className="text-xs font-medium text-muted-foreground block mb-1.5"
              >
                Name
              </label>
              <input
                id="edit-mailbox-name"
                ref={editInputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave) {
                    e.preventDefault();
                    void (async () => {
                      setSaving(true);
                      try {
                        await onRenameMailbox(
                          editingMailbox.id,
                          newName.trim(),
                        );
                        onBack();
                      } finally {
                        setSaving(false);
                      }
                    })();
                  }
                }}
                className="w-full rounded-md bg-muted/50 border border-border/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
          )}
          {onRenameMailbox && (
            <div className="flex items-center justify-end gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onBack();
                }}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onRenameMailbox(editingMailbox.id, newName.trim());
                    onBack();
                  } finally {
                    setSaving(false);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                Save
              </button>
            </div>
          )}
          <div className="border-t border-border/40 pt-3">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 px-3 py-2 w-full rounded-md text-left text-destructive hover:bg-destructive/10 focus:outline-none transition-colors text-sm"
              >
                <Trash2 className="size-4 shrink-0" />
                Delete mailbox
              </button>
            ) : (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive mb-3">
                  Delete <strong>{editingMailbox.name}</strong>? All messages
                  inside will be permanently removed.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 px-3 py-1.5 text-sm text-muted-foreground rounded-md border border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await onDeleteMailbox(editingMailbox.id);
                        setConfirmDelete(false);
                        onBack();
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                  >
                    {saving && <Loader2 className="size-3.5 animate-spin" />}
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
