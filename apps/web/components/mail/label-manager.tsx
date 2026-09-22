"use client";

import { useState } from "react";
import { Plus, Tag } from "lucide-react";
import type { LabelDef } from "@/lib/mail/types";
import {
  normalizeLabelColorInput,
  resolveLabelDisplayColor,
} from "@/lib/mail/mail-label-colors";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteField,
  PaletteFormActions,
  PaletteNavRow,
  PaletteSection,
  PaletteView,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";
import { LabelColorPicker } from "./label-color-picker";

export type LabelManagerView = "labels" | "label-create" | "label-edit";

const DEFAULT_LABEL_COLOR = "#3b82f6";

interface LabelManagerProps {
  labels: LabelDef[];
  currentView: LabelManagerView;
  onBack: () => void;
  onNavigateTo: (view: LabelManagerView) => void;
  onCreateLabel?: (name: string, color: string) => Promise<LabelDef | null>;
  onUpdateLabel?: (
    labelId: string,
    updates: { name: string; color: string },
  ) => Promise<void>;
  onDeleteLabel?: (id: string) => Promise<void>;
}

function LabelForm({
  title,
  initialName,
  initialColor,
  submitLabel,
  onBack,
  onSubmit,
  onDelete,
}: {
  title: string;
  initialName: string;
  initialColor: string;
  submitLabel: string;
  onBack: () => void;
  onSubmit: (name: string, color: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
  const saving = status === "saving";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const trimmed = name.trim();
  const canSave =
    trimmed.length > 0 &&
    !saving &&
    (trimmed !== initialName || color !== initialColor);

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
    if (canSave) void run(() => onSubmit(trimmed, normalizeLabelColorInput(color)));
  };

  return (
    <PaletteView title={title} onBack={onBack}>
      <PaletteField label="Name" htmlFor="label-name">
        <input
          id="label-name"
          type="text"
          value={name}
          autoComplete="off"
          placeholder="Label name"
          aria-label="Label name"
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
      <PaletteField label="Color">
        <LabelColorPicker color={color} onChange={setColor} disabled={saving} />
      </PaletteField>
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
            onClick={() =>
              confirmDelete ? void run(onDelete) : setConfirmDelete(true)
            }
          >
            {confirmDelete ? "Confirm delete" : "Delete label"}
          </PaletteButton>
        ) : null}
        <PaletteButton variant="ghost" onClick={onBack} disabled={saving}>
          Cancel
        </PaletteButton>
        <PaletteButton
          variant="primary"
          loading={saving}
          disabled={!canSave}
          onClick={submit}
        >
          {submitLabel}
        </PaletteButton>
      </PaletteFormActions>
    </PaletteView>
  );
}

export function LabelManager({
  labels,
  currentView,
  onBack,
  onNavigateTo,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
}: LabelManagerProps) {
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const editingLabel = labels.find((label) => label.id === editingLabelId);

  if (currentView === "label-create" && onCreateLabel) {
    return (
      <LabelForm
        title="New label"
        initialName=""
        initialColor={DEFAULT_LABEL_COLOR}
        submitLabel="Create"
        onBack={onBack}
        onSubmit={async (name, color) => {
          await onCreateLabel(name, color);
        }}
      />
    );
  }

  if (currentView === "label-edit" && editingLabel) {
    return (
      <LabelForm
        key={editingLabel.id}
        title={editingLabel.name}
        initialName={editingLabel.name}
        initialColor={resolveLabelDisplayColor(editingLabel.color)}
        submitLabel="Save"
        onBack={onBack}
        onSubmit={async (name, color) => {
          await onUpdateLabel?.(editingLabel.id, { name, color });
        }}
        onDelete={
          onDeleteLabel ? () => onDeleteLabel(editingLabel.id) : undefined
        }
      />
    );
  }

  return (
    <PaletteView title="Labels" onBack={onBack}>
      {onCreateLabel ? (
        <PaletteSection>
          <PaletteNavRow
            icon={Plus}
            label="New label"
            trailing={null}
            onClick={() => onNavigateTo("label-create")}
          />
        </PaletteSection>
      ) : null}
      {labels.length > 0 ? (
        <PaletteSection label="Your labels">
          {labels.map((label) => (
            <PaletteNavRow
              key={label.id}
              icon={Tag}
              iconColor={resolveLabelDisplayColor(label.color)}
              label={label.name}
              disabled={!onUpdateLabel && !onDeleteLabel}
              onClick={() => {
                setEditingLabelId(label.id);
                onNavigateTo("label-edit");
              }}
            />
          ))}
        </PaletteSection>
      ) : (
        <PaletteEmptyState>
          Labels let you tag messages across mailboxes.
        </PaletteEmptyState>
      )}
    </PaletteView>
  );
}
