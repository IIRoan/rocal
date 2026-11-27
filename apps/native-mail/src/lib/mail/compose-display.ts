import type { ComposeMode } from "./compose-request";

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

const COMPOSE_TITLES: Record<ComposeMode, string> = {
  reply: "Reply",
  "reply-all": "Reply all",
  forward: "Forward",
  draft: "Draft",
};

/** What the compose drawer is for; a reply never takes its subject as the title. */
export function composeTitle(mode: ComposeMode | undefined): string {
  return mode ? COMPOSE_TITLES[mode] : "New message";
}

/** A reply keeps its thread's recipients and subject; only Cc and Bcc can be added. */
export function isThreadReply(mode: ComposeMode | undefined): boolean {
  return mode === "reply" || mode === "reply-all";
}

/** The floating format pill's height: one row of 44pt tools plus its inset. */
export const COMPOSE_FORMAT_BAR_HEIGHT = 48;

/** The pill floats this far from the screen edges and from the keyboard. */
export const COMPOSE_FORMAT_BAR_GAP = 10;
