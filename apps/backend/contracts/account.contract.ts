export type DeleteAccountInput = {
  userId: string;
};

export type DeleteAccountResult = {
  success: boolean;
  message: string;
  deletedUserId: string;
};

export interface IAccountService {
  deleteAccount(input: DeleteAccountInput): Promise<DeleteAccountResult>;
}
