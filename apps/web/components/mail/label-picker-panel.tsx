"use client";

import { useId, useReducer, useRef, useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import type { LabelDef } from "@/lib/mail/types";
import {
  MAIL_LABEL_CUSTOM_DEFAULT_COLOR,
  normalizeLabelColorInput,
  resolveLabelDisplayColor,
} from "@workspace/calendar-core";
import { LabelColorPicker } from "./label-color-picker";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

const DEFAULT_LABEL_COLOR = MAIL_LABEL_CUSTOM_DEFAULT_COLOR;

const initialLabelPickerState = {
  editingLabelId: null as string | null,
  editName: "",
  editColor: DEFAULT_LABEL_COLOR,
  isSavingEdit: false,
  editNameMissing: false,
  confirmDeleteId: null as string | null,
};

type LabelPickerState = typeof initialLabelPickerState;

function labelPickerReducer(
  state: LabelPickerState,
  patch: Partial<LabelPickerState>,
): LabelPickerState {
  return { ...state, ...patch };
}

interface LabelPickerPanelProps {
  labels: LabelDef[];
  messageKeywords?: Record<string, boolean>;
  onToggleLabel?: (labelId: string, assigned: boolean) => void;
  onCreateLabel?: (name: string, color: string) => Promise<LabelDef | null | void>;
  onUpdateLabel?: (
    labelId: string,
    updates: { name: string; color: string },
  ) => Promise<void> | void;
  onDeleteLabel?: (labelId: string) => void;
  className?: string;
}

export function LabelPickerPanel({
  labels,
  messageKeywords,
  onToggleLabel,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  className,
}: LabelPickerPanelProps) {
  const [state, patch] = useReducer(
    labelPickerReducer,
    initialLabelPickerState,
  );
  const {
    editingLabelId,
    editName,
    editColor,
    isSavingEdit,
    editNameMissing,
    confirmDeleteId,
  } = state;
  const confirmDeleteLabel = labels.find((label) => label.id === confirmDeleteId);
  const nameErrorId = useId();
  const editInputRef = useRef<HTMLInputElement>(null);

  const startEditing = (label: LabelDef) => {
    patch({
      editingLabelId: label.id,
      editName: label.name,
      editColor: resolveLabelDisplayColor(label.color),
      confirmDeleteId: null,
    });
  };

  const requestDelete = (labelId: string) => {
    if (confirmDeleteId !== labelId) {
      patch({ confirmDeleteId: labelId });
      return;
    }
    patch({ confirmDeleteId: null });
    onDeleteLabel?.(labelId);
  };

  const cancelEditing = () => {
    patch({
      editingLabelId: null,
      editName: "",
      editColor: DEFAULT_LABEL_COLOR,
      editNameMissing: false,
    });
  };

  const handleSaveEdit = async () => {
    if (!onUpdateLabel || !editingLabelId) return;
    if (!editName.trim()) {
      patch({ editNameMissing: true });
      editInputRef.current?.focus();
      return;
    }
    patch({ isSavingEdit: true });
    // Callee label handlers report save failures to the user; nothing more to do here.
    let saved = true;
    try {
      await Promise.resolve(
        onUpdateLabel(editingLabelId, {
          name: editName.trim(),
          color: normalizeLabelColorInput(editColor),
        }),
      );
    } catch {
      saved = false;
    }
    patch({ isSavingEdit: false });
    if (saved) cancelEditing();
  };

  return (
    <div className={cn("overflow-hidden", className)}>
      {labels.length > 0 ? (
        <div className="p-1 max-h-52 overflow-y-auto">
          {labels.map((label) => {
            const assigned = messageKeywords?.[`label:${label.id}`] === true;
            const displayColor = resolveLabelDisplayColor(label.color);
            const isEditing = editingLabelId === label.id;

            if (isEditing) {
              return (
                <div
                  key={label.id}
                  className="rounded-lg bg-muted p-2 space-y-2"
                >
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editName}
                    onChange={(e) =>
                      patch({ editName: e.target.value, editNameMissing: false })
                    }
                    disabled={isSavingEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSaveEdit();
                      if (e.key === "Escape") cancelEditing();
                    }}
                    className="h-7 w-full rounded bg-background px-2 text-[15px] text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    aria-label="Edit label name"
                    aria-invalid={editNameMissing || undefined}
                    aria-describedby={editNameMissing ? nameErrorId : undefined}
                  />
                  {editNameMissing ? (
                    <p id={nameErrorId} className="text-[13px] text-destructive">
                      Enter a label name.
                    </p>
                  ) : null}
                  <LabelColorPicker
                    color={editColor}
                    onChange={(color) => patch({ editColor: color })}
                    disabled={isSavingEdit}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={() => void handleSaveEdit()}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-foreground px-2 text-xs font-medium text-background disabled:opacity-50"
                    >
                      {isSavingEdit ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Check className="size-3" />
                      )}
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={cancelEditing}
                      className="inline-flex h-7 items-center rounded-md px-2 text-[13px] text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }

            const isConfirmingDelete = confirmDeleteId === label.id;
            return (
              <div
                key={label.id}
                className="group flex items-center rounded hover:bg-muted transition-colors"
              >
                {onToggleLabel ? (
                  <button
                    type="button"
                    aria-pressed={assigned}
                    onClick={() => {
                      patch({ confirmDeleteId: null });
                      onToggleLabel(label.id, !assigned);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-[15px] text-left cursor-pointer select-none"
                  >
                    <span
                      className="size-2.5 rounded-full shrink-0 ring-1 ring-offset-1 ring-offset-popover"
                      style={{
                        backgroundColor: displayColor,
                        boxShadow: assigned
                          ? `0 0 0 1px ${displayColor}`
                          : undefined,
                      }}
                    />
                    <span className="flex-1 truncate text-foreground/80">
                      {label.name}
                    </span>
                    {assigned ? (
                      <Check
                        className="size-3 text-foreground/50 shrink-0"
                        strokeWidth={2.5}
                      />
                    ) : null}
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-[15px]">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: displayColor }}
                    />
                    <span className="flex-1 truncate text-foreground/80">
                      {label.name}
                    </span>
                  </div>
                )}
                {onUpdateLabel ? (
                  <SimpleTooltip content={`Edit ${label.name}`}>
                    <button
                      type="button"
                      onClick={() => startEditing(label)}
                      className="mr-0.5 size-6 flex items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-hover/60 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                      aria-label={`Edit label ${label.name}`}
                    >
                      <Pencil className="size-3" strokeWidth={2.25} />
                    </button>
                  </SimpleTooltip>
                ) : null}
                {onDeleteLabel ? (
                  <SimpleTooltip content={`Delete ${label.name}`}>
                    <button
                      type="button"
                      onClick={() => requestDelete(label.id)}
                      className={cn(
                        "mr-1 flex h-6 min-w-6 shrink-0 items-center justify-center rounded transition-colors",
                        isConfirmingDelete
                          ? "bg-destructive/10 px-2 text-[13px] font-medium text-destructive"
                          : "text-muted-foreground hover:text-destructive",
                      )}
                      aria-label={`Delete label ${label.name}`}
                    >
                      {isConfirmingDelete ? (
                        "Delete"
                      ) : (
                        <Trash2 className="size-3" strokeWidth={2.25} />
                      )}
                    </button>
                  </SimpleTooltip>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-3 py-4 text-center text-[13px] text-muted-foreground">
          No labels yet
        </div>
      )}

      <p role="status" className="px-3 pb-1 text-[13px] leading-[130%] text-destructive empty:pb-0">
        {confirmDeleteLabel
          ? `Delete “${confirmDeleteLabel.name}”? Messages keep their content; only this label is removed. Select Delete again to confirm.`
          : null}
      </p>

      {onCreateLabel ? <NewLabelForm onCreateLabel={onCreateLabel} /> : null}
    </div>
  );
}

function NewLabelForm({
  onCreateLabel,
}: {
  onCreateLabel: (name: string, color: string) => Promise<LabelDef | null | void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_LABEL_COLOR);
  const [isSaving, setIsSaving] = useState(false);
  const [nameMissing, setNameMissing] = useState(false);
  const nameErrorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setNameMissing(true);
      inputRef.current?.focus();
      return;
    }
    setIsSaving(true);
    // Callee label handlers report save failures to the user; nothing more to do here.
    let saved = true;
    try {
      await onCreateLabel(name.trim(), normalizeLabelColorInput(color));
    } catch {
      saved = false;
    }
    setIsSaving(false);
    if (saved) {
      setName("");
      setColor(DEFAULT_LABEL_COLOR);
    }
  };

  return (
    <div className="p-2 space-y-2">
      <div className="text-[13px] font-medium text-muted-foreground px-1">
        New label
      </div>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setNameMissing(false);
        }}
        aria-label="New label name"
        aria-invalid={nameMissing || undefined}
        aria-describedby={nameMissing ? nameErrorId : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleCreate();
        }}
        placeholder="Label name…"
        disabled={isSaving}
        className="h-7 w-full text-[12px] bg-muted/60 border-0 rounded px-2 outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground disabled:opacity-50"
      />
      {nameMissing ? (
        <p id={nameErrorId} className="px-1 text-[13px] text-destructive">
          Enter a label name.
        </p>
      ) : null}
      <LabelColorPicker color={color} onChange={setColor} disabled={isSaving} />
      <button
        type="button"
        disabled={isSaving}
        onClick={() => void handleCreate()}
        className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-muted/80 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
      >
        {isSaving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" strokeWidth={2.25} />
        )}
        Create label
      </button>
    </div>
  );
}
