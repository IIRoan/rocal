import namedReferences from "./vendor/mail-html-entities.json";

// WHATWG character-reference data retained from postal-mime 2.7.4; both licenses are in vendor/.
const NAMED_REFERENCES: Record<string, string> = namedReferences;

export function decodeMailHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);?/gi,
    (reference) => {
      const named = NAMED_REFERENCES[reference];
      if (named !== undefined) return named;
      if (!reference.startsWith("&#") || !reference.endsWith(";"))
        return reference;
      const hexadecimal = reference.charAt(2).toLowerCase() === "x";
      const code = Number.parseInt(
        reference.slice(hexadecimal ? 3 : 2, -1),
        hexadecimal ? 16 : 10,
      );
      if (
        !Number.isFinite(code) ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      )
        return "\ufffd";
      return String.fromCodePoint(code);
    },
  );
}
