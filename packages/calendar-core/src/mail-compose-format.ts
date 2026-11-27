import { escapeComposeHtml } from "./mail-compose-html";

export type TextSelection = {
  start: number;
  end: number;
};

export function hasComposeFormatting(text: string): boolean {
  return /(\*\*|__|_(?!\s)|^- )/m.test(text);
}

function applyInlineMarkdown(escaped: string): string {
  return escaped
    .replace(/__([^_\n]+)__/g, "<u>$1</u>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?;:])/g, "$1<em>$2</em>");
}

/** Turns a draft saved by an older native build, written in markdown-lite, into editor HTML. */
export function composeTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized.trim()) {
    return "";
  }

  const blocks = normalized.split(/\n{2,}/);
  const htmlBlocks = blocks.map((block) => {
    // A reply's leading blank lines need a line box, or the caret cannot land above the quote.
    if (!block) return "<p><br></p>";
    const lines = block.split("\n");
    const isList = lines.every((line) => line.length === 0 || line.startsWith("- "));
    if (isList && lines.some((line) => line.startsWith("- "))) {
      const items = lines
        .filter((line) => line.startsWith("- "))
        .map((line) => `<li>${applyInlineMarkdown(escapeComposeHtml(line.slice(2)))}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }
    return `<p>${applyInlineMarkdown(escapeComposeHtml(block)).replace(/\n/g, "<br>")}</p>`;
  });

  return htmlBlocks.join("");
}

export type ComposeTextFields = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

function normalizeComposeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** True when the user typed something beyond the prefilled seed (signature, reply quote), so closing should keep a draft. */
export function hasComposeUserContent(
  current: ComposeTextFields,
  seed: ComposeTextFields,
): boolean {
  return (Object.keys(current) as Array<keyof ComposeTextFields>).some(
    (key) => normalizeComposeText(current[key]) !== normalizeComposeText(seed[key]),
  );
}
