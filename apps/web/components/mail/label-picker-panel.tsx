"use client";

import { useReducer } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import type { LabelDef } from "@/lib/mail/types";
import {
  normalizeLabelColorInput,
  resolveLabelDisplayColor,
} from "@workspace/calendar-core";
import { LabelColorPicker } from "./label-color-picker";

const DEFAULT_LABEL_COLOR = "#6366f1";

const initialLabelPickerState = {
  newLabelName: "",
  newLabelColor: DEFAULT_LABEL_COLOR,
  isSavingLabel: false,
  editingLabelId: null as string | null,
  editName: "",
  editColor: DEFAULT_LABEL_COLOR,
  isSavingEdit: false,
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
    newLabelName,
    newLabelColor,
    isSavingLabel,
    editingLabelId,
    editName,
    editColor,
    isSavingEdit,
  } = state;

  const startEditing = (label: LabelDef) => {
    patch({
      editingLabelId: label.id,
      editName: label.name,
      editColor: resolveLabelDisplayColor(label.color),
    });
  };

  const cancelEditing = () => {
    patch({
      editingLabelId: null,
      editName: "",
      editColor: DEFAULT_LABEL_COLOR,
    });
  };

  const handleCreate = async () => {
    if (!onCreateLabel || !newLabelName.trim()) return;
    patch({ isSavingLabel: true });
    await onCreateLabel(
      newLabelName.trim(),
      normalizeLabelColorInput(newLabelColor),
    ).finally(() => patch({ isSavingLabel: false }));
    patch({ newLabelName: "", newLabelColor: DEFAULT_LABEL_COLOR });
  };

  const handleSaveEdit = async () => {
    if (!onUpdateLabel || !editingLabelId || !editName.trim()) return;
    patch({ isSavingEdit: true });
    await Promise.resolve(
      onUpdateLabel(editingLabelId, {
        name: editName.trim(),
        color: normalizeLabelColorInput(editColor),
      }),
    ).finally(() => patch({ isSavingEdit: false }));
    cancelEditing();
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
                    type="text"
                    value={editName}
                    onChange={(e) => patch({ editName: e.target.value })}
                    disabled={isSavingEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSaveEdit();
                      if (e.key === "Escape") cancelEditing();
                    }}
                    className="h-7 w-full rounded bg-background px-2 text-[15px] text-foreground outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
                    aria-label="Edit label name"
                  />
                  <LabelColorPicker
                    color={editColor}
                    onChange={(color) => patch({ editColor: color })}
                    disabled={isSavingEdit}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isSavingEdit || !editName.trim()}
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

            return (
              <div
                key={label.id}
                className="group flex items-center rounded hover:bg-muted transition-colors"
              >
                {onToggleLabel ? (
                  <button
                    type="button"
                    onClick={() => onToggleLabel(label.id, !assigned)}
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
                  <button
                    type="button"
                    onClick={() => startEditing(label)}
                    className="mr-0.5 size-6 flex items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent/60 hover:text-foreground group-hover:opacity-100"
                    aria-label={`Edit label ${label.name}`}
                    title={`Edit ${label.name}`}
                  >
                    <Pencil className="size-3" strokeWidth={2.25} />
                  </button>
                ) : null}
                {onDeleteLabel ? (
                  <button
                    type="button"
                    onClick={() => onDeleteLabel(label.id)}
                    className="mr-1 size-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                    aria-label={`Delete label ${label.name}`}
                    title={`Delete ${label.name}`}
                  >
                    <Trash2 className="size-3" strokeWidth={2.25} />
                  </button>
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

      {onCreateLabel ? (
        <div className="p-2 space-y-2">
          <div className="text-[13px] font-[470] text-muted-foreground/80 px-1">
            New label
          </div>
          <input
            type="text"
            value={newLabelName}
            onChange={(e) => patch({ newLabelName: e.target.value })}
            aria-label="New label name"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newLabelName.trim()) {
                void handleCreate();
              }
            }}
            placeholder="Label name…"
            disabled={isSavingLabel}
            className="h-7 w-full text-[12px] bg-muted/60 border-0 rounded px-2 outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground/40 disabled:opacity-50"
          />
          <LabelColorPicker
            color={newLabelColor}
            onChange={(color) => patch({ newLabelColor: color })}
            disabled={isSavingLabel}
          />
          <button
            type="button"
            disabled={!newLabelName.trim() || isSavingLabel}
            onClick={() => void handleCreate()}
            className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-muted/80 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            {isSavingLabel ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" strokeWidth={2.25} />
            )}
            Create label
          </button>
        </div>
      ) : null}
    </div>
  );
}
