import { getErrorMessage } from "@workspace/calendar-core";
import {
  useMailAccount,
  useMailConfig,
  useMailRuntime,
  useProvisionMailbox,
} from "../lib/mail/use-mail";
import { useMailOfflineSync } from "./use-mail-offline-sync";

/** Mailbox availability for the screen gate: account load, provisioning, then the JMAP runtime. */
export function useMailAccountState() {
  const accountQuery = useMailAccount();
  const configQuery = useMailConfig();
  const provisionMailbox = useProvisionMailbox();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data;
  useMailOfflineSync(runtime);

  return {
    runtime,
    provisioned,
    refetchRuntime: runtimeQuery.refetch,
    runtimeLoading: runtimeQuery.isPending && !runtime,
    gate: {
      accountPending: accountQuery.isPending && !accountQuery.data,
      accountFailed: accountQuery.isError && !accountQuery.data,
      accountErrorMessage: getErrorMessage(
        accountQuery.error,
        "Failed to load mail",
      ),
      retryAccount: () => accountQuery.refetch(),
      provisioned,
      setupEnabled: configQuery.data?.signupEnabled ?? true,
      setupPending: provisionMailbox.isPending,
      setupErrorMessage: provisionMailbox.error
        ? getErrorMessage(
            provisionMailbox.error,
            "Could not create your mailbox.",
          )
        : null,
      startSetup: () => provisionMailbox.mutate(),
      runtimePending: runtimeQuery.isPending && !runtimeQuery.data,
      runtimeFailed: runtimeQuery.isError && !runtimeQuery.data,
      runtimeErrorMessage: getErrorMessage(
        runtimeQuery.error,
        "Failed to connect to your mailbox",
      ),
      retryRuntime: () => runtimeQuery.refetch(),
    },
  };
}
