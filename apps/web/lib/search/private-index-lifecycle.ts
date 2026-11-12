import { getActiveE2eeSession } from "@/lib/e2ee-session";
import { isPrivateContentIndexEnabled } from "./private-index-flags";

let generation = 0;
let blockedSession: ReturnType<typeof getActiveE2eeSession>;

export function invalidatePrivateSearch(): void {
  generation += 1;
}

export function suspendPrivateSearch(): void {
  blockedSession = getActiveE2eeSession();
  invalidatePrivateSearch();
}

export function capturePrivateSearchRequest(accountId: string) {
  const session = getActiveE2eeSession();
  const startedAt = generation;
  return {
    session,
    isCurrent: () =>
      session !== null &&
      session !== blockedSession &&
      session.userId === accountId &&
      getActiveE2eeSession() === session &&
      startedAt === generation &&
      isPrivateContentIndexEnabled() &&
      (typeof window === "undefined" ||
        window.localStorage.getItem("search:private-content-index-paused") !==
          "true"),
  };
}
