export { HttpClient } from "./http-client";
export type { HttpClientConfig, RequestOptions } from "./http-client";

export { AccountApiService } from "./account-api-service";
export type {
  AccountSignupConfigResponse,
  CheckEmailAvailabilityCode,
  CheckEmailAvailabilityResponse,
} from "./account-api-service";

export { CalendarApiService } from "./calendar-api-service";
export type { DeleteAccountResponse } from "./calendar-api-service";
export { createSolaceProfileLookupBatcher } from "./solace-profile-lookup";

export { InviteApiService } from "./invite-api-service";
export type {
  InviteStatus,
  InviteRecord,
  ListInvitesResponse,
  CreateInviteResponse,
  RevokeInviteResponse,
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
