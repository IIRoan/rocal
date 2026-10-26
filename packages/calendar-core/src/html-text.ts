// Only a real tag start (`<` + letter, `/`, `!`, `?`) opens a tag, and an unclosed one runs to the end in one match, so hostile mail cannot make this quadratic.
const TAG_PATTERN = /<[a-z/!?][^>]*(?:>|$)/gi;

export function stripHtmlTags(html: string, replacement = " "): string {
  return html.replace(TAG_PATTERN, replacement);
}
