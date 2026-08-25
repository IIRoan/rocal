export type LoginSearchParams = {
  nextPath: string | null;
  callbackUrl: string | null;
  resetSucceeded: boolean;
  inviteToken: string | null;
  stepUpRequired: boolean;
};

export function readLoginSearchParams(searchParams: {
  get: (name: string) => string | null;
}): LoginSearchParams {
  return {
    nextPath: searchParams.get("next"),
    callbackUrl:
      searchParams.get("callbackURL") || searchParams.get("callbackUrl"),
    resetSucceeded: searchParams.get("reset") === "success",
    inviteToken: searchParams.get("invite"),
    stepUpRequired: searchParams.get("stepUp") === "1",
  };
}
