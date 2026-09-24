export const EMPTY_ARRAY: never[] = [];

export const PLAINTEXT_COLLAPSE_THRESHOLD = 1200;

/** Matches the email document background so the skeleton → body swap has no colour flash. */
export function mailBodySurfaceClassName(isDark: boolean) {
  return isDark
    ? "bg-[#1a1a1a] [color-scheme:dark]"
    : "bg-white [color-scheme:light]";
}

export const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);

export const COMMON_EMOJI = [
  "😀",
  "😂",
  "😍",
  "😭",
  "😊",
  "😅",
  "😎",
  "🤔",
  "😤",
  "🥺",
  "😏",
  "😴",
  "🤗",
  "😬",
  "🥳",
  "🤩",
  "😇",
  "😆",
  "🙄",
  "😡",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🤝",
  "✌️",
  "👋",
  "🤞",
  "💪",
  "🖐️",
  "❤️",
  "💔",
  "💯",
  "🔥",
  "✨",
  "🎉",
  "🎊",
  "💡",
  "⭐",
  "🌟",
  "😻",
  "🐶",
  "🐱",
  "🌸",
  "🌈",
  "☀️",
  "🌙",
  "⚡",
  "🌊",
  "🍕",
  "🎵",
  "📷",
  "💬",
  "📩",
  "🔔",
  "📅",
  "📎",
  "🔗",
  "💻",
  "📱",
] as const;
