import { z } from "zod";
import { strictZodObject } from "../lib/validation";
import { userIdField } from "./_zod";

export const emailAvailabilityQuerySchema = strictZodObject({
  email: z.string().min(1).max(320),
});

export const checkEmailAvailabilityInputSchema = emailAvailabilityQuerySchema;

export const deleteAccountInputSchema = z.object(userIdField).strict();

export type AccountSignupConfig = {
  defaultEmailDomain: string;
};

export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;
export type CheckEmailAvailabilityInput = z.infer<
  typeof checkEmailAvailabilityInputSchema
>;

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
