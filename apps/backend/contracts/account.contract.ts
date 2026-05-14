export type AccountSignupConfig = {
  defaultEmailDomain: string;
};

export type DeleteAccountInput = {
  userId: string;
};

export type CheckEmailAvailabilityInput = {
  email: string;
};

export type CheckEmailAvailabilityCode =
  | "available"
  | "invalid_email"
  | "already_in_use";

export type CheckEmailAvailabilityResult = {
  email: string;
  localPart: string | null;
  domain: string;
  normalizedEmail: string;
  available: boolean;
  code: CheckEmailAvailabilityCode;
  message: string;
};

export type DeleteAccountResult = {
  success: boolean;
  message: string;
  deletedUserId: string;
};

export interface IAccountService {
  getSignupConfig(): AccountSignupConfig;
  checkEmailAvailability(
    input: CheckEmailAvailabilityInput,
  ): Promise<CheckEmailAvailabilityResult>;
  deleteAccount(input: DeleteAccountInput): Promise<DeleteAccountResult>;
}
