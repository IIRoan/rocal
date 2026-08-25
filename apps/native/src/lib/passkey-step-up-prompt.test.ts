import { resolvePasskeyAutoPromptAction } from "./passkey-step-up-prompt";

describe("resolvePasskeyAutoPromptAction", () => {
  it("skips while step-up is not required, matching the first render of a normal sign-in", () => {
    expect(
      resolvePasskeyAutoPromptAction({
        requiresPasskeyStepUp: false,
        isPasswordSignInInFlight: false,
        hasStartedPrompt: false,
      }),
    ).toBe("skip");
  });

  it("prompts when step-up becomes required after the screen has already mounted", () => {
    expect(
      resolvePasskeyAutoPromptAction({
        requiresPasskeyStepUp: true,
        isPasswordSignInInFlight: false,
        hasStartedPrompt: false,
      }),
    ).toBe("prompt");
  });

  it("lets AuthProvider own the prompt during password sign-in", () => {
    expect(
      resolvePasskeyAutoPromptAction({
        requiresPasskeyStepUp: true,
        isPasswordSignInInFlight: true,
        hasStartedPrompt: false,
      }),
    ).toBe("mark-handled");
  });

  it("does not prompt again after a prompt has already started", () => {
    expect(
      resolvePasskeyAutoPromptAction({
        requiresPasskeyStepUp: true,
        isPasswordSignInInFlight: false,
        hasStartedPrompt: true,
      }),
    ).toBe("skip");
  });
});
