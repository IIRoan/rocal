"use client";

import React, { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Key, Smartphone, Usb } from "lucide-react";
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

export function PasskeySettings({
  open,
  onBack,
  startInAddMode = false,
}: PasskeySettingsProps) {
  const queryClient = useQueryClient();
  const [showAddOverride, setShowAddPasskey] = useState<boolean | null>(null);
  const showAddPasskey = showAddOverride ?? startInAddMode;
  const [passkeyName, setPasskeyName] = useState("");

  // Passkey utility functions
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case "platform":
        return Smartphone;
      case "cross-platform":
        return Usb;
      default:
        return Key;
    }
  };

  const { data: passkeys = [], isLoading: passkeyLoading } = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) {
        throw new Error(error.message || "Failed to load passkeys");
      }
      return Array.isArray(data)
        ? data.filter(
            (passkey) => passkey && typeof passkey === "object" && passkey.id,
          )
        : [];
    },
    enabled: open,
  });

  const addPasskeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const passkeyNameToAdd = name.trim();

      const addOptions = {
        name: passkeyNameToAdd,
      };

      const { data, error } = await authClient.passkey.addPasskey(addOptions);

      // Check if there's an error message about "undefined has no properties"
      // but the passkey might have been added successfully
      if (error && error.message && error.message.includes("undefined")) {
        // Refresh the passkey list to check if it was actually added
        const { data: refreshedData } =
          await authClient.passkey.listUserPasskeys();
        const validPasskeys = Array.isArray(refreshedData)
          ? refreshedData.filter(
              (passkey) => passkey && typeof passkey === "object" && passkey.id,
            )
          : [];

        // Check if the passkey was actually added by looking for it in the refreshed list
        const wasAdded = validPasskeys.some(
          (passkey) => passkey && passkey.name === passkeyNameToAdd,
        );

        if (wasAdded) {
          return { success: true, name: passkeyNameToAdd };
        } else {
          throw new Error(error.message || "Failed to add passkey");
        }
      } else if (error) {
        throw new Error(error.message || "Failed to add passkey");
      }

      return { success: true, name: passkeyNameToAdd };
    },
    onSuccess: (result: { success: boolean; name: string }) => {
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      toast.success(`Passkey '${result.name}' added successfully`);
      setShowAddPasskey(false);
      setPasskeyName("");
    },
    onError: (err: any) => {
      // As a final check, refresh the list and see if the passkey was added
      // This logic was in the original catch block, but it's hard to replicate exactly in onError
      // We'll rely on the mutationFn handling the specific "undefined" error case
      toast.error(err.message || "Failed to add passkey");
    },
  });

  const deletePasskeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) {
        throw new Error(error.message || "Failed to delete passkey");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      toast.success("Passkey deleted successfully!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete passkey");
    },
  });

  const addPasskey = () => {
    if (!passkeyName.trim()) {
      toast.error("Please enter a name for your passkey");
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
              <span className="block text-muted-foreground/70">
                Add your first passkey to enable passwordless authentication
              </span>
            </PaletteEmptyState>
          ) : (
            <PaletteSection label="Your Passkeys">
              {passkeys.flatMap((passkey: any) => {
                if (!passkey?.id) return [];

                const DeviceIcon = getDeviceIcon(passkey?.deviceType);
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
                        {passkey?.name || "Unnamed Passkey"}
                      </div>
                      <p className="text-[13px] leading-[130%] text-muted-foreground">
                        Added{" "}
                        {passkey?.createdAt
                          ? new Date(passkey.createdAt).toLocaleDateString()
                          : "Unknown date"}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Delete passkey"
                      onClick={() => deletePasskeyMutation.mutate(passkey.id)}
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
              onChange={(e) => setPasskeyName(e.target.value)}
              placeholder="e.g., iPhone Face ID, YubiKey"
              className={PALETTE_INPUT_CLASS}
            />
          </PaletteField>
          <PaletteFormActions>
            <PaletteButton
              variant="ghost"
              onClick={() => {
                setShowAddPasskey(false);
                setPasskeyName("");
              }}
              disabled={addPasskeyMutation.isPending}
            >
              Cancel
            </PaletteButton>
            <PaletteButton
              variant="primary"
              onClick={addPasskey}
              loading={addPasskeyMutation.isPending}
              disabled={!passkeyName.trim()}
            >
              {addPasskeyMutation.isPending ? "Adding…" : "Create Passkey"}
            </PaletteButton>
          </PaletteFormActions>
        </>
      )}
    </PaletteView>
  );
}
