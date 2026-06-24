"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import type { LabelDef } from "@/lib/mail/types";
import {
  isValidLabelHex,
  MAIL_LABEL_PRESET_COLORS,
  normalizeLabelColorInput,
  resolveLabelDisplayColor,
} from "@/lib/mail/mail-label-colors";

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

function LabelColorPicker({
  color,
  onChange,
  disabled,
}: {
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const [hexInput, setHexInput] = useState("");
  const preview = normalizeLabelColorInput(color);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {MAIL_LABEL_PRESET_COLORS.map((entry) => (
        <button
          key={entry.value}
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(entry.hex);
            setHexInput("");
          }}
          style={{ backgroundColor: entry.hex }}
          className={cn(
            "size-4 rounded-full transition-transform disabled:opacity-50",
            color === entry.hex || color === entry.value
              ? "ring-2 ring-ring ring-offset-1 ring-offset-popover scale-110"
              : "hover:scale-105",
          )}
          aria-label={entry.label}
          title={entry.label}
        />
      ))}
      <div className="flex items-center gap-1 ml-0.5">
        <input
          type="color"
          value={isValidLabelHex(preview) ? preview : "#6366f1"}
          onChange={(e) => {
            onChange(e.target.value);
            setHexInput("");
          }}
          disabled={disabled}
          className="size-4 rounded cursor-pointer border-0 p-0 bg-transparent disabled:opacity-50"
          title="Custom color"
          aria-label="Custom label color"
        />
        <input
          type="text"
          value={hexInput}
          onChange={(e) => {
            const value = e.target.value;
            setHexInput(value);
            if (isValidLabelHex(value)) onChange(value);
          }}
          placeholder="#hex"
          disabled={disabled}
          className="h-6 w-[4.5rem] rounded bg-muted/60 px-1.5 text-[10px] font-mono text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring/40 disabled:opacity-50"
          aria-label="Label hex color"
        />
      </div>
    </div>
  );
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
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");
  const [isSavingLabel, setIsSavingLabel] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#6366f1");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const startEditing = (label: LabelDef) => {
    setEditingLabelId(label.id);
    setEditName(label.name);
    setEditColor(resolveLabelDisplayColor(label.color));
  };

  const cancelEditing = () => {
    setEditingLabelId(null);
    setEditName("");
    setEditColor("#6366f1");
  };

  const handleCreate = async () => {
    if (!onCreateLabel || !newLabelName.trim()) return;
    setIsSavingLabel(true);
    try {
      await onCreateLabel(
        newLabelName.trim(),
        normalizeLabelColorInput(newLabelColor),
      );
      setNewLabelName("");
      setNewLabelColor("#6366f1");
    } finally {
      setIsSavingLabel(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!onUpdateLabel || !editingLabelId || !editName.trim()) return;
    setIsSavingEdit(true);
    try {
      await onUpdateLabel(editingLabelId, {
        name: editName.trim(),
        color: normalizeLabelColorInput(editColor),
      });
      cancelEditing();
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className={cn("overflow-hidden", className)}>
      {labels.length > 0 ? (
        <div className="p-1 border-b border-border/40 max-h-52 overflow-y-auto">
          {labels.map((label) => {
            const assigned = messageKeywords?.[`label:${label.id}`] === true;
            const displayColor = resolveLabelDisplayColor(label.color);
            const isEditing = editingLabelId === label.id;

            if (isEditing) {
              return (
                <div
                  key={label.id}
                  className="rounded-md border border-border/50 bg-muted/30 p-2 space-y-2"
                >
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={isSavingEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSaveEdit();
                      if (e.key === "Escape") cancelEditing();
                    }}
                    className="h-7 w-full rounded bg-background px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring/40 disabled:opacity-50"
                    aria-label="Edit label name"
                  />
                  <LabelColorPicker
                    color={editColor}
                    onChange={setEditColor}
                    disabled={isSavingEdit}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isSavingEdit || !editName.trim()}
                      onClick={() => void handleSaveEdit()}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
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
                      className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-accent/50"
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
                className="group flex items-center rounded hover:bg-accent/50 transition-colors"
              >
                {onToggleLabel ? (
                  <button
                    type="button"
                    onClick={() => onToggleLabel(label.id, !assigned)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm text-left cursor-pointer select-none"
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
                  <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm">
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
        <div className="px-3 py-4 text-center text-xs text-muted-foreground border-b border-border/40">
          No labels yet
        </div>
      )}

      {onCreateLabel ? (
        <div className="p-2 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
            New label
          </div>
          <input
            type="text"
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            aria-label="New label name"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newLabelName.trim()) {
                void handleCreate();
              }
            }}
            placeholder="Label name…"
            disabled={isSavingLabel}
            className="h-7 w-full text-[12px] bg-muted/60 border-0 rounded px-2 outline-none focus:ring-1 focus:ring-ring/50 placeholder:text-muted-foreground/40 disabled:opacity-50"
          />
          <LabelColorPicker
            color={newLabelColor}
            onChange={setNewLabelColor}
            disabled={isSavingLabel}
          />
          <button
            type="button"
            disabled={!newLabelName.trim() || isSavingLabel}
            onClick={() => void handleCreate()}
            className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-muted/80 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
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
