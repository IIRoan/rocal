export { HttpClient } from "./http-client";
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
export { createSolaceProfileLookupBatcher } from "./solace-profile-lookup";

export { InviteApiService } from "./invite-api-service";
export type {
  InviteRecord,
  ValidateInviteTokenResponse,
  ClaimInviteResponse,
} from "./invite-api-service";

export { NoopE2eeProvider } from "@workspace/e2ee";
export {
  backfillEncryptedNames,
  NAME_BACKFILL_BATCH_SIZE,
} from "./name-encryption-backfill";
export type { NameEncryptionBackfillResult } from "./name-encryption-backfill";
export type { E2eeProvider } from "@workspace/e2ee";
