"use client";

import { useReducer, useRef, useState } from "react";
import { Plus, Tag } from "lucide-react";
import type { LabelDef } from "@/lib/mail/types";
import {
  normalizeLabelColorInput,
  resolveLabelDisplayColor,
} from "@workspace/calendar-core";
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

// "blue" resolves to the shared mail label preset hex in calendar-core.
const DEFAULT_LABEL_COLOR = resolveLabelDisplayColor("blue");

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

type LabelFormState = {
  name: string;
  color: string;
  saving: boolean;
  failure: string | null;
  nameMissing: boolean;
  confirmDelete: boolean;
};

function labelFormReducer(
  state: LabelFormState,
  patch: Partial<LabelFormState>,
): LabelFormState {
  return { ...state, ...patch };
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
  const [form, patch] = useReducer(labelFormReducer, {
    name: initialName,
    color: initialColor,
    saving: false,
    failure: null,
    nameMissing: false,
    confirmDelete: false,
  });
  const { name, color, saving, failure, nameMissing, confirmDelete } = form;
  const nameInputRef = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();
  const changed = trimmed !== initialName || color !== initialColor;

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
    if (!trimmed) {
      patch({ nameMissing: true });
      nameInputRef.current?.focus();
      return;
    }
    if (changed && !saving) {
      run(
        () => onSubmit(trimmed, normalizeLabelColorInput(color)),
        "Label not saved. Check your connection and try again.",
      );
    }
  };

  return (
    <PaletteView title={title} onBack={onBack}>
      <PaletteField label="Name" htmlFor="label-name">
        <input
          ref={nameInputRef}
          id="label-name"
          type="text"
          value={name}
          autoComplete="off"
          placeholder="Label name"
          aria-label="Label name"
          aria-invalid={nameMissing || undefined}
          aria-describedby={nameMissing ? "label-name-error" : undefined}
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
          <p id="label-name-error" className="text-[13px] leading-[130%] text-destructive">
            Enter a label name.
          </p>
        ) : null}
      </PaletteField>
      <PaletteField label="Color">
        <LabelColorPicker
          color={color}
          onChange={(nextColor) => patch({ color: nextColor })}
          disabled={saving}
        />
      </PaletteField>
      <p role="status" className="px-2 pt-2 text-[13px] leading-[130%] text-destructive empty:pt-0">
        {confirmDelete
          ? `Delete “${initialName}”? Messages stay in their mailboxes; only this label is removed from them.`
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
                ? run(onDelete, "Label not deleted. Check your connection and try again.")
                : patch({ confirmDelete: true })
            }
          >
            {confirmDelete ? "Delete label" : "Delete label…"}
          </PaletteButton>
        ) : null}
        <PaletteButton
          variant="ghost"
          onClick={confirmDelete ? () => patch({ confirmDelete: false }) : onBack}
          disabled={saving}
        >
          {confirmDelete ? "Keep label" : "Cancel"}
        </PaletteButton>
        <PaletteButton
          variant="primary"
          loading={saving}
          disabled={!changed}
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
