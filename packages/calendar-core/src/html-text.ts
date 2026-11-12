// Only a real tag start (`<` + letter, `/`, `!`, `?`) opens a tag, and an unclosed one runs to the end in one match, so hostile mail cannot make this quadratic.
const TAG_PATTERN = /<[a-z/!?][^>]*(?:>|$)/gi;

export function stripHtmlTags(html: string, replacement = " "): string {
  return html.replace(TAG_PATTERN, replacement);
}

/** Replaces each tag by what `replace` returns for it, with the same linear tag matching as `stripHtmlTags`. */
export function replaceHtmlTags(
  html: string,
  replace: (tag: string) => string,
): string {
  return html.replace(TAG_PATTERN, replace);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  colon: ":",
  gt: ">",
  lpar: "(",
  lt: "<",
  newline: "\n",
  nbsp: " ",
  quot: '"',
  rpar: ")",
  sol: "/",
  tab: "\t",
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));?/gi,
    (match, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
      if (hex || dec) {
        const code = Number.parseInt(hex ?? dec ?? "", hex ? 16 : 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
        return String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[(name ?? "").toLowerCase()] ?? match;
    },
  );
}
