import {
  getSignInErrorMessage,
  SIGN_IN_REJECTED_MESSAGE,
  SIGN_IN_UNREACHABLE_MESSAGE,
} from "../auth-session";

describe("getSignInErrorMessage", () => {
  it("keeps the server's own message", () => {
    expect(getSignInErrorMessage({ message: "Too many attempts.", status: 429 })).toBe(
      "Too many attempts.",
    );
  });

  it("reports a gateway or network failure as unreachable, not as wrong credentials", () => {
    expect(getSignInErrorMessage({ status: 502 })).toBe(SIGN_IN_UNREACHABLE_MESSAGE);
    expect(getSignInErrorMessage({ message: "  ", status: 503 })).toBe(SIGN_IN_UNREACHABLE_MESSAGE);
    expect(getSignInErrorMessage({ status: 0 })).toBe(SIGN_IN_UNREACHABLE_MESSAGE);
    expect(getSignInErrorMessage({})).toBe(SIGN_IN_UNREACHABLE_MESSAGE);
  });

  it("reports a refusal without a message as wrong credentials", () => {
    expect(getSignInErrorMessage({ status: 401 })).toBe(SIGN_IN_REJECTED_MESSAGE);
  });
});
