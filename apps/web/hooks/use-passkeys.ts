"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "@workspace/calendar-core";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { webQueryKeys } from "@/lib/query-keys";

type PasskeyRecord = NonNullable<
  Awaited<ReturnType<typeof authClient.passkey.listUserPasskeys>>["data"]
>[number];

function filterValidPasskeys(
  data: PasskeyRecord[] | null | undefined,
): PasskeyRecord[] {
  return Array.isArray(data)
    ? data.filter(
        (passkey) => passkey && typeof passkey === "object" && passkey.id,
      )
    : [];
}

export function usePasskeys(enabled: boolean) {
  return useQuery({
    queryKey: webQueryKeys.passkeys(),
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) {
        throw new Error(error.message || "Failed to load passkeys");
      }
      return filterValidPasskeys(data);
    },
    enabled,
  });
}

export function useAddPasskey(input: { onAdded: () => void }) {
  const queryClient = useQueryClient();
  const { onAdded } = input;

  return useMutation({
    mutationFn: async (name: string) => {
      const passkeyNameToAdd = name.trim();

      const addOptions = {
        name: passkeyNameToAdd,
      };

      const { data, error } = await authClient.passkey.addPasskey(addOptions);

      // Better Auth can report "undefined has no properties" after a successful add, so confirm the stored list.
      if (error && error.message && error.message.includes("undefined")) {
        const { data: refreshedData } =
          await authClient.passkey.listUserPasskeys();
        const storedPasskeys = filterValidPasskeys(refreshedData);
        const wasAdded = storedPasskeys.some(
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
      queryClient.invalidateQueries({ queryKey: webQueryKeys.passkeys() });
      toast.success(`Passkey '${result.name}' added successfully`);
      onAdded();
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to add passkey"));
    },
  });
}

export function useDeletePasskey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) {
        throw new Error(error.message || "Failed to delete passkey");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webQueryKeys.passkeys() });
      toast.success("Passkey deleted successfully!");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to delete passkey"));
    },
  });
}
