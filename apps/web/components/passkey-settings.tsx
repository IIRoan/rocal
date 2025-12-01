"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/navigation/command";
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Trash2,
  Key,
  Smartphone,
  Usb,
} from "lucide-react";

interface PasskeySettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
}

export function PasskeySettings({
  open,
  onOpenChange,
  onBack,
}: PasskeySettingsProps) {
  const queryClient = useQueryClient();
  const [showAddPasskey, setShowAddPasskey] = useState(false);
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
            (passkey) => passkey && typeof passkey === "object" && passkey.id
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
              (passkey) => passkey && typeof passkey === "object" && passkey.id
            )
          : [];

        // Check if the passkey was actually added by looking for it in the refreshed list
        const wasAdded = validPasskeys.some(
          (passkey) => passkey && passkey.name === passkeyNameToAdd
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
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <h2 className="text-lg font-semibold text-foreground">Passkeys</h2>
      </div>
      <CommandList>
        {!showAddPasskey ? (
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => setShowAddPasskey(true)}
              disabled={passkeyLoading}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Plus className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Add New Passkey</span>
            </CommandItem>
          </CommandGroup>
        ) : (
          <CommandGroup heading="Add New Passkey">
            <div className="px-4 py-3 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Passkey Name
                </label>
                <input
                  type="text"
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                  placeholder="e.g., iPhone Face ID, YubiKey"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={addPasskey}
                  disabled={addPasskeyMutation.isPending || !passkeyName.trim()}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                >
                  {addPasskeyMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin inline" />
                      Adding...
                    </>
                  ) : (
                    "Create Passkey"
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowAddPasskey(false);
                    setPasskeyName("");
                  }}
                  disabled={addPasskeyMutation.isPending}
                  className="px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </CommandGroup>
        )}

        {passkeyLoading && passkeys.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading passkeys...</p>
          </div>
        ) : passkeys.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Key className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mb-2">
              No passkeys found
            </p>
            <p className="text-xs text-muted-foreground">
              Add your first passkey to enable passwordless authentication
            </p>
          </div>
        ) : (
          <CommandGroup heading="Your Passkeys">
            {passkeys
              .filter((passkey: any) => passkey && passkey.id)
              .map((passkey: any) => {
                const DeviceIcon = getDeviceIcon(passkey?.deviceType);
                return (
                  <div
                    key={passkey.id}
                    className="px-4 py-3 border-b border-border/30 last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-muted">
                          <DeviceIcon className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {passkey?.name || "Unnamed Passkey"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Added{" "}
                            {passkey?.createdAt
                              ? new Date(passkey.createdAt).toLocaleDateString()
                              : "Unknown date"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => deletePasskeyMutation.mutate(passkey.id)}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
