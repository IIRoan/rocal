import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountApiService, inviteApiService } from "../lib/api";
import {
  toInviteValidationState,
  validateInviteTokenSafely,
  type InviteValidationState,
} from "../lib/invite-signup";
import { QUERY_KEYS } from "../lib/query-keys";

const DEFAULT_SIGNUP_DOMAIN = "solace.onl";
const INVITE_VALIDATION_DEBOUNCE_MS = 500;

export function useSignupDomain(): string {
  const { data } = useQuery({
    queryKey: QUERY_KEYS.signupConfig(),
    queryFn: () => accountApiService.getSignupConfig(),
    staleTime: 60 * 60 * 1000,
  });
  return data?.defaultEmailDomain ?? DEFAULT_SIGNUP_DOMAIN;
}

/** Debounced live invite check, matching the web sign-up form. */
export function useInviteTokenValidation(token: string): InviteValidationState {
  const trimmed = token.trim();
  const [debounced, setDebounced] = useState(trimmed);

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebounced(trimmed),
      INVITE_VALIDATION_DEBOUNCE_MS,
    );
    return () => clearTimeout(timeout);
  }, [trimmed]);

  const { data } = useQuery({
    queryKey: QUERY_KEYS.inviteValidation(debounced),
    queryFn: () => validateInviteTokenSafely(inviteApiService, debounced),
    enabled: debounced.length > 0,
    select: toInviteValidationState,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  if (!trimmed) return { status: "empty" };
  if (trimmed !== debounced || !data) return { status: "checking" };
  return data;
}
