const COLLAPSE_AFTER = 2;

/** Collapsed rows show every chip up to two, otherwise the first chip plus a "+N" overflow. */
export function collapseRecipientChips<T>(
  chips: readonly T[],
  expanded: boolean,
): { visible: T[]; hiddenCount: number } {
  if (expanded || chips.length <= COLLAPSE_AFTER) {
    return { visible: [...chips], hiddenCount: 0 };
  }
  return { visible: chips.slice(0, 1), hiddenCount: chips.length - 1 };
}

export function composeTitle(subject: string): string {
  return subject.trim() || "New message";
}
