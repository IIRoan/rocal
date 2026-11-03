"use client";

import React, { useState } from "react";
import { Loader2, Plus, Trash2, Key, Smartphone, Usb } from "lucide-react";
import {
  useAddPasskey,
  useDeletePasskey,
  usePasskeys,
} from "@/hooks/use-passkeys";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteField,
  PaletteFormActions,
  PaletteIconBox,
  PaletteNavRow,
  PaletteSection,
  PaletteSectionLabel,
  PaletteView,
} from "./command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "./command-palette/palette-styles";

interface PasskeySettingsProps {
  open: boolean;
  onBack: () => void;
  startInAddMode?: boolean;
}

/** Better Auth passkey rows; the loader hook only guarantees a non-empty id. */
type PasskeyRow = {
  id: string;
  name?: string | null;
  deviceType?: string | null;
  createdAt?: string | Date | null;
};

export function PasskeySettings({
  open,
  onBack,
  startInAddMode = false,
}: PasskeySettingsProps) {
  const [showAddOverride, setShowAddPasskey] = useState<boolean | null>(null);
  const showAddPasskey = showAddOverride ?? startInAddMode;
  const [passkeyName, setPasskeyName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  // Passkey utility functions
  const getDeviceIcon = (deviceType?: string | null) => {
    switch (deviceType) {
      case "platform":
        return Smartphone;
      case "cross-platform":
        return Usb;
      default:
        return Key;
    }
  };

  const { data: passkeys = [], isLoading: passkeyLoading } = usePasskeys(open);

  const addPasskeyMutation = useAddPasskey({
    onAdded: () => {
      setShowAddPasskey(false);
      setPasskeyName("");
    },
  });

  const deletePasskeyMutation = useDeletePasskey();

  const addPasskey = () => {
    if (!passkeyName.trim()) {
      setNameError("Enter a name for this passkey, such as the device it is on");
      return;
    }
    addPasskeyMutation.mutate(passkeyName);
  };

  return (
    <PaletteView title="Passkeys" onBack={onBack}>
      {!showAddPasskey ? (
        <>
          <PaletteSection>
            <PaletteNavRow
              icon={Plus}
              label="Add New Passkey"
              onClick={() => setShowAddPasskey(true)}
              disabled={passkeyLoading}
            />
          </PaletteSection>

          {passkeyLoading && passkeys.length === 0 ? (
            <PaletteEmptyState>
              <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
              Loading passkeys…
            </PaletteEmptyState>
          ) : passkeys.length === 0 ? (
            <PaletteEmptyState>
              <span className="block">No passkeys found</span>
              <span className="block">
                Add your first passkey to enable passwordless authentication
              </span>
            </PaletteEmptyState>
          ) : (
            <PaletteSection label="Your Passkeys">
              {passkeys.flatMap((passkey: PasskeyRow) => {
                if (!passkey?.id) return [];

                const DeviceIcon = getDeviceIcon(passkey?.deviceType);
                const passkeyLabel = passkey?.name || "Unnamed Passkey";
                if (confirmingDeleteId === passkey.id) {
                  return [
                    <div key={passkey.id}>
                      <p className="px-2 py-1.5 text-[13px] leading-[130%] text-foreground">
                        Delete &ldquo;{passkeyLabel}&rdquo;? You can no longer
                        sign in with this passkey.
                      </p>
                      <PaletteFormActions>
                        <PaletteButton
                          variant="ghost"
                          autoFocus
                          onClick={() => setConfirmingDeleteId(null)}
                        >
                          Cancel
                        </PaletteButton>
                        <PaletteButton
                          variant="destructive"
                          onClick={() => {
                            deletePasskeyMutation.mutate(passkey.id);
                            setConfirmingDeleteId(null);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          Delete passkey
                        </PaletteButton>
                      </PaletteFormActions>
                    </div>,
                  ];
                }
                return [
                  <div
                    key={passkey.id}
                    className="flex min-h-11 items-center gap-3 px-2 py-1.5 sm:min-h-9"
                  >
                    <PaletteIconBox>
                      <DeviceIcon className="size-4" />
                    </PaletteIconBox>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] leading-[130%] text-foreground">
                        {passkeyLabel}
                      </div>
                      <p className="text-[13px] leading-[130%] text-muted-foreground">
                        Added{" "}
                        {passkey?.createdAt
                          ? new Date(passkey.createdAt).toLocaleDateString(
                              undefined,
                              { dateStyle: "medium" },
                            )
                          : "Unknown date"}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${passkeyLabel}`}
                      onClick={() => setConfirmingDeleteId(passkey.id)}
                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>,
                ];
              })}
            </PaletteSection>
          )}
        </>
      ) : (
        <>
          <PaletteSectionLabel>Add New Passkey</PaletteSectionLabel>
          <PaletteField label="Passkey Name" htmlFor="passkey-name">
            <input
              id="passkey-name"
              aria-label="Passkey Name"
              type="text"
              value={passkeyName}
              onChange={(e) => {
                setPasskeyName(e.target.value);
                setNameError(undefined);
              }}
              placeholder="e.g., iPhone Face ID, YubiKey"
              aria-invalid={nameError ? true : undefined}
              className={PALETTE_INPUT_CLASS}
            />
            {nameError ? (
              <p role="alert" className="text-[13px] text-destructive">
                {nameError}
              </p>
            ) : null}
          </PaletteField>
          <PaletteFormActions>
            <PaletteButton
              variant="ghost"
              onClick={() => {
                setShowAddPasskey(false);
                setPasskeyName("");
                setNameError(undefined);
              }}
              disabled={addPasskeyMutation.isPending}
            >
              Cancel
            </PaletteButton>
            <PaletteButton
              variant="primary"
              onClick={addPasskey}
              loading={addPasskeyMutation.isPending}
            >
              {addPasskeyMutation.isPending ? "Adding…" : "Create passkey"}
            </PaletteButton>
          </PaletteFormActions>
        </>
      )}
    </PaletteView>
  );
}
