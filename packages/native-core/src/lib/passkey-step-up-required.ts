let requirePasskeyStepUpRef: (() => void) | null = null;

export function registerPasskeyStepUpRequired(fn: () => void) {
  requirePasskeyStepUpRef = fn;
}

export function triggerPasskeyStepUpRequired() {
  requirePasskeyStepUpRef?.();
}
