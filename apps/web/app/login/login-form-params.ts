import type { E2eeLockReason } from "@/lib/auth-navigation";

export type LoginSearchParams = {
  nextPath: string | null;
  callbackUrl: string | null;
  inviteToken: string | null;
  stepUpRequired: boolean;
  e2eeLock: E2eeLockReason | null;
};

function readE2eeLock(value: string | null): E2eeLockReason | null {
  return value === "sign-in" || value === "failed" ? value : null;
}

export function readLoginSearchParams(searchParams: {
  get: (name: string) => string | null;
}): LoginSearchParams {
  return {
    nextPath: searchParams.get("next"),
    callbackUrl:
      searchParams.get("callbackURL") || searchParams.get("callbackUrl"),
    inviteToken: searchParams.get("invite"),
    stepUpRequired: searchParams.get("stepUp") === "1",
    e2eeLock: readE2eeLock(searchParams.get("e2ee")),
  };
}
