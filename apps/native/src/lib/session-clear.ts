let clearSessionRef: (() => void) | null = null;

export function registerClearSession(fn: () => void) {
  clearSessionRef = fn;
}

export function triggerSessionClear() {
  clearSessionRef?.();
}
