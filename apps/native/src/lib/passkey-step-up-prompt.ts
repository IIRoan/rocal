export function resolvePasskeyAutoPromptAction(input: {
  requiresPasskeyStepUp: boolean;
  isPasswordSignInInFlight: boolean;
  hasStartedPrompt: boolean;
}): "prompt" | "mark-handled" | "skip" {
  if (!input.requiresPasskeyStepUp || input.hasStartedPrompt) {
    return "skip";
  }

  if (input.isPasswordSignInInFlight) {
    return "mark-handled";
  }

  return "prompt";
}
