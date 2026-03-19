"use client";

import React, { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { Input } from "@workspace/ui/components/ui/input";
import { Button } from "@workspace/ui/components/ui/button";
import { Label } from "@workspace/ui/components/ui/label";
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Trash2,
  Key,
  Smartphone,
  Usb,
  ChevronRight,
} from "lucide-react";

interface PasskeySettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  startInAddMode?: boolean;
}

export function PasskeySettings({
  open,
  onOpenChange,
  onBack,
  startInAddMode = false,
}: PasskeySettingsProps) {
  return (
    <PasskeySettingsBody
      key={startInAddMode ? "add" : "default"}
      open={open}
      onOpenChange={onOpenChange}
      onBack={onBack}
      startInAddMode={startInAddMode}
    />
  );
}

function PasskeySettingsBody({
  open,
  onOpenChange,
  onBack,
  startInAddMode = false,
}: PasskeySettingsProps) {
  const queryClient = useQueryClient();
  const [showAddPasskey, setShowAddPasskey] = useState(startInAddMode);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
      >
        <VisuallyHidden>
          <DialogTitle>Passkeys</DialogTitle>
        </VisuallyHidden>
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="p-1 h-auto"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </Button>
            <span className="text-sm font-medium">Passkeys</span>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {!showAddPasskey ? (
              <>
                {/* Add Passkey Button */}
                <div className="p-1">
                  <Button
                    variant="ghost"
                    onClick={() => setShowAddPasskey(true)}
                    disabled={passkeyLoading}
                    className="w-full justify-start h-auto px-3 py-2 font-normal"
                  >
                    <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1 text-left">Add New Passkey</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </Button>
                </div>

                {passkeyLoading && passkeys.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Loading passkeys...
                    </p>
                  </div>
                ) : passkeys.length === 0 ? (
                  <div className="px-4 py-6 text-center border-t border-border/50">
                    <Key className="h-6 w-6 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground mb-1">
                      No passkeys found
                    </p>
                    <p className="text-[10px] text-muted-foreground/50">
                      Add your first passkey to enable passwordless
                      authentication
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50">
                      Your Passkeys
                    </div>
                    <div className="p-1">
                      {passkeys
                        .filter((passkey: any) => passkey && passkey.id)
                        .map((passkey: any) => {
                          const DeviceIcon = getDeviceIcon(passkey?.deviceType);
                          return (
                            <div
                              key={passkey.id}
                              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/20 transition-colors"
                            >
                              <div className="p-1 rounded bg-muted/50 shrink-0">
                                <DeviceIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">
                                  {passkey?.name || "Unnamed Passkey"}
                                </div>
                                <p className="text-[10px] text-muted-foreground/60">
                                  Added{" "}
                                  {passkey?.createdAt
                                    ? new Date(
                                        passkey.createdAt,
                                      ).toLocaleDateString()
                                    : "Unknown date"}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  deletePasskeyMutation.mutate(passkey.id)
                                }
                                className="p-1.5 h-auto hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Add Passkey Form */}
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  Add New Passkey
                </div>
                <div className="px-4 py-3 space-y-3">
                  <div>
                    <Label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Passkey Name
                    </Label>
                    <Input
                      type="text"
                      value={passkeyName}
                      onChange={(e) => setPasskeyName(e.target.value)}
                      placeholder="e.g., iPhone Face ID, YubiKey"
                      className="h-9 text-sm"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={addPasskey}
                      disabled={
                        addPasskeyMutation.isPending || !passkeyName.trim()
                      }
                      size="sm"
                      className="flex-1"
                    >
                      {addPasskeyMutation.isPending ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        "Create Passkey"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddPasskey(false);
                        setPasskeyName("");
                      }}
                      disabled={addPasskeyMutation.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
