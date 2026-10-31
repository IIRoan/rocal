import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  UpdateSettingsRequest,
  UserSettings,
} from "@workspace/calendar-core";
import { getErrorMessage } from "@workspace/calendar-core";
import { calendarApiService } from "../lib/api";
import { QUERY_KEYS } from "../lib/query-keys";
import { useToast } from "../providers/ToastProvider";

export function useNativeUserSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (input: {
      update: UpdateSettingsRequest;
      isCurrent?: () => boolean;
    }) => calendarApiService.updateUserSettings(input.update, input.isCurrent),
    onMutate: async ({ update, isCurrent }) => {
      if (isCurrent && !isCurrent()) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.settings() });
      const previous = queryClient.getQueryData<UserSettings>(
        QUERY_KEYS.settings(),
      );
      if (previous) {
        queryClient.setQueryData<UserSettings>(QUERY_KEYS.settings(), {
          ...previous,
          ...Object.fromEntries(
            Object.entries(update).filter(([key]) => key !== "riftbound"),
          ),
        });
      }
      const keys = Object.keys(update);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const key of keys) next.add(key);
        return next;
      });
      return { previous };
    },
    onError: (_err, input, context) => {
      if (input.isCurrent && !input.isCurrent()) return;
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.settings(), context.previous);
      }
    },
    onSettled: (_data, _error, { update, isCurrent }) => {
      if (isCurrent && !isCurrent()) return;
      const keys = Object.keys(update);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const key of keys) next.delete(key);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => calendarApiService.resetUserSettings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
      toast("Settings reset to defaults");
    },
    onError: (error) => {
      toast(getErrorMessage(error, "Failed to reset settings"), "error");
    },
  });

  const updateSetting = useCallback(
    (update: UpdateSettingsRequest) => {
      updateSettingsMutation.mutate({ update });
    },
    [updateSettingsMutation],
  );

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    pendingKeys,
    updateSetting,
    saveSetting: (update: UpdateSettingsRequest, isCurrent?: () => boolean) =>
      updateSettingsMutation.mutateAsync({ update, isCurrent }),
    resetSettingsMutation,
  };
}
