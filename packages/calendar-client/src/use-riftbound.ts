import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useMutationState,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  DEFAULT_RIFTBOUND_PREFERENCES,
  normalizeRiftboundRiotId,
  riftboundPreferencesSchema,
  riftboundSyncMutationKey,
  riftboundQueryAffected,
  type RiftboundPreferences,
} from "@workspace/calendar-core/riftbound-settings";
import type { CalendarApiService } from "./calendar-api-service";

type SyncResult = Awaited<
  ReturnType<CalendarApiService["syncRiftboundEvents"]>
>;
type HashIdentity = (normalized: string) => Promise<string>;

export function useRiftboundImportNotifier(
  preferences: RiftboundPreferences | undefined,
  corpusKey: QueryKey,
) {
  const client = useQueryClient();
  return (result: SyncResult) => {
    if (!result.eventsCreated) return;
    Promise.all([
      client.invalidateQueries({
        predicate: (query) =>
          riftboundQueryAffected(
            query.queryKey,
            result.events,
            preferences?.durationMinutes ??
              DEFAULT_RIFTBOUND_PREFERENCES.durationMinutes,
          ),
      }),
      client.invalidateQueries({ queryKey: corpusKey, exact: true }),
    ]).catch(() => {});
  };
}

export function useRiftboundForm(options: {
  api: CalendarApiService;
  initial?: RiftboundPreferences;
  scope: string | null;
  saveSettings: (
    preferences: RiftboundPreferences,
    isCurrent: () => boolean,
  ) => Promise<void>;
  hashIdentity: HashIdentity;
  onImported: (result: SyncResult) => void;
}) {
  const generation = useRef(0);
  // Only an account change cancels a save; closing the form lets it finish.
  useEffect(() => {
    generation.current += 1;
  }, [options.scope]);
  const [draft, setDraft] = useState(
    () => options.initial ?? DEFAULT_RIFTBOUND_PREFERENCES,
  );
  const [eventUrl, setEventUrl] = useState("");
  const store = useMutation({
    mutationFn: (url: string) => options.api.resolveRiftboundStore(url),
    onSuccess: (resolved) => {
      setDraft((previous) => ({
        ...previous,
        stores: [
          ...previous.stores.filter((item) => item.id !== resolved.id),
          resolved,
        ].slice(0, 10),
      }));
      setEventUrl("");
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const parsed = riftboundPreferencesSchema.safeParse(draft);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message ?? "Check your Riftbound settings.",
        );
      const epoch = generation.current;
      await options.saveSettings(
        parsed.data,
        () => generation.current === epoch,
      );
      return parsed.data;
    },
  });
  const saved = save.data ?? options.initial ?? DEFAULT_RIFTBOUND_PREFERENCES;
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const sync = useMutation({
    mutationKey: riftboundSyncMutationKey(options.scope),
    onMutate: () => ({ epoch: generation.current }),
    mutationFn: async () => {
      const epoch = generation.current;
      const config = riftboundPreferencesSchema.parse(saved);
      const hash = config.registeredOnly
        ? await options.hashIdentity(normalizeRiftboundRiotId(config.riotId))
        : "";
      return options.api.syncRiftboundEvents(
        config,
        hash,
        () => generation.current === epoch,
      );
    },
    onSuccess: (result, _input, context) => {
      if (context?.epoch === generation.current) options.onImported(result);
    },
  });
  const states = useMutationState({
    filters: { mutationKey: riftboundSyncMutationKey(options.scope) },
    select: (mutation) => ({
      id: mutation.mutationId,
      status: mutation.state.status,
    }),
  });
  let latest: (typeof states)[number] | undefined;
  for (const state of states) {
    if (!latest || state.id > latest.id) latest = state;
  }
  return {
    draft,
    setDraft,
    eventUrl,
    setEventUrl,
    store,
    save,
    sync,
    dirty,
    backgroundPending: latest?.status === "pending",
    backgroundError: latest?.status === "error" && draft.enabled && !dirty,
  };
}

export function useRiftboundAutoSync(options: {
  api: CalendarApiService;
  preferences?: RiftboundPreferences;
  scope: string | null;
  enabled: boolean;
  isActive: () => boolean;
  subscribeToResume: (run: () => void) => () => void;
  hashIdentity: HashIdentity;
  onImported: (result: SyncResult) => void;
}) {
  const {
    api,
    scope,
    enabled,
    isActive,
    subscribeToResume,
    hashIdentity,
    onImported,
  } = options;
  const fingerprint = JSON.stringify(
    options.preferences ?? DEFAULT_RIFTBOUND_PREFERENCES,
  );
  const { mutateAsync } = useMutation({
    mutationKey: riftboundSyncMutationKey(scope),
    mutationFn: async (input: {
      preferences: RiftboundPreferences;
      isCurrent: () => boolean;
    }) => {
      const hash = input.preferences.registeredOnly
        ? await hashIdentity(normalizeRiftboundRiotId(input.preferences.riotId))
        : "";
      return api.syncRiftboundEvents(input.preferences, hash, input.isCurrent);
    },
    onSuccess: (result, input) => {
      if (input.isCurrent()) onImported(result);
    },
  });
  useEffect(() => {
    const parsed: unknown = JSON.parse(fingerprint);
    const preferences = riftboundPreferencesSchema.parse(parsed);
    if (!enabled || !preferences.enabled) return;
    let current = true;
    let busy = false;
    let lastRun = Number.NEGATIVE_INFINITY;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      if (busy || !isActive() || !current || Date.now() - lastRun < 60_000)
        return;
      lastRun = Date.now();
      busy = true;
      await mutateAsync({ preferences, isCurrent: () => current }).catch(
        () => {},
      );
      busy = false;
    };
    run().catch(() => {});
    const stopResume = subscribeToResume(() => {
      if (resumeTimer !== null) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(
        () => {
          run().catch(() => {});
        },
        Math.max(0, 60_000 - (Date.now() - lastRun)),
      );
    });
    const timer = setInterval(() => {
      run().catch(() => {});
    }, 15 * 60_000);
    return () => {
      current = false;
      clearInterval(timer);
      stopResume();
      if (resumeTimer !== null) clearTimeout(resumeTimer);
    };
  }, [fingerprint, scope, enabled, isActive, subscribeToResume, mutateAsync]);
}
