export { HttpClient } from "./http-client";
export { createAuthKeyFetch } from "./auth-key-fetch";
export { changePasswordWithEnvelope } from "./password-change";
export type { PasswordEnvelopeRequest } from "./password-change";
export { createMailAccessTokenManager } from "./mail-access-token";
export type { MailAccessToken } from "./mail-access-token";
export type {
  ApiResponse,
  HttpClientConfig,
  RequestOptions,
} from "./http-client";

export { AccountApiService } from "./account-api-service";

export { CalendarApiService } from "./calendar-api-service";
export {
  persistRecurringEventDelete,
  persistRecurringEventEdit,
} from "./recurring-event-persistence";
export type {
  DeleteRecurringEventInput,
  EditRecurringEventInput,
} from "./recurring-event-persistence";
export {
  loadEventSearchCorpus,
  sealReadableInvitations,
} from "./event-search-corpus";
export { respondToMailInvitation } from "./mail-invitation-response";
export type {
  MailInvitationResponse,
  MailInvitationResponseInput,
} from "./mail-invitation-response";
export { createSolaceProfileLookupBatcher } from "./solace-profile-lookup";

export { InviteApiService } from "./invite-api-service";
export type {
  InviteRecord,
  ValidateInviteTokenResponse,
  ClaimInviteResponse,
} from "./invite-api-service";

export { NoopE2eeProvider } from "@workspace/e2ee";
export type { E2eeProvider } from "@workspace/e2ee";
