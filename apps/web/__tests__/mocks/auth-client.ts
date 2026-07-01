import { jest } from "@jest/globals";

type JestMock = ReturnType<typeof jest.fn>;

type AuthClientMock = {
  signIn: JestMock;
  signOut: JestMock;
  signUp: JestMock;
  useSession: JestMock;
  getSession: JestMock;
};

export const authClient: AuthClientMock = {
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
  useSession: jest.fn(() => ({ data: null, isPending: false })),
  getSession: jest.fn(() => Promise.resolve({ data: null })),
};

export const signIn: JestMock = authClient.signIn;
export const signOut: JestMock = authClient.signOut;
export const signUp: JestMock = authClient.signUp;
export const useSession: JestMock = authClient.useSession;
