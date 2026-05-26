const GOOGLE_INVITE_SEPARATOR_LINE = /^-[:~]{10,}$/;
const GOOGLE_INVITE_BOILERPLATE_LINES = [
  /^Join with Google Meet:/i,
  /^Learn more about Meet at:/i,
  /^Please do not edit this section\./i,
];

function shouldStripInviteLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) {
    return false;
  }

  if (GOOGLE_INVITE_SEPARATOR_LINE.test(normalized)) {
    return true;
  }

  return GOOGLE_INVITE_BOILERPLATE_LINES.some((pattern) =>
    pattern.test(normalized),
  );
}

function collapseBlankLines(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanInviteMailText(text: string): string {
  if (!text) {
    return text;
  }

  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => !shouldStripInviteLine(line))
    .join("\n");

  return collapseBlankLines(cleaned);
}

export function cleanInviteMailHtml(html: string): string {
  if (!html) {
    return html;
  }

  let cleaned = html.replace(/-[:~]{10,}/gi, "");
  cleaned = cleaned.replace(/Join with Google Meet:[^<]*/gi, "");
  cleaned = cleaned.replace(/Learn more about Meet at:[^<]*/gi, "");
  cleaned = cleaned.replace(/Please do not edit this section\./gi, "");
  cleaned = cleaned.replace(/<(\w+)([^>]*)>\s*<\/\1>/gi, "");
  return cleaned;
}
