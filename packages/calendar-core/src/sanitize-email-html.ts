const DANGEROUS_TAG_PATTERN =
  /<\/?(?:script|style|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi;

const EVENT_HANDLER_ATTR_PATTERN = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

const URL_ATTR_NAMES = [
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "poster",
  "background",
  "data",
] as const;

const DANGEROUS_URL_PROTOCOL_PATTERN =
  /^\s*(?:javascript|vbscript|data\s*:\s*text\/html)/i;

function isDangerousUrl(value: string): boolean {
  const trimmed = value.trim().replace(/\s+/g, "").toLowerCase();
  if (!trimmed) {
    return false;
  }
  if (DANGEROUS_URL_PROTOCOL_PATTERN.test(trimmed)) {
    return true;
  }
  // Obfuscated javascript: (j&#x61;vascript:)
  if (/^j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i.test(trimmed)) {
    return true;
  }
  return false;
}

function stripDangerousUrlProtocolsFromHtml(html: string): string {
  let result = html;
  for (const attr of URL_ATTR_NAMES) {
    const attrPattern = new RegExp(
      `(${attr}\\s*=\\s*)("([^"]*)"|'([^']*)')`,
      "gi",
    );
    result = result.replace(attrPattern, (match, prefix, _dq, doubleQuoted, singleQuoted) => {
      const value = doubleQuoted ?? singleQuoted ?? "";
      if (isDangerousUrl(value)) {
        return `${prefix}""`;
      }
      return match;
    });
  }
  return result;
}

function stripDangerousTagsRegex(html: string): string {
  return html.replace(DANGEROUS_TAG_PATTERN, "").replace(EVENT_HANDLER_ATTR_PATTERN, "");
}

function sanitizeWithDomParser(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc
    .querySelectorAll(
      "script, style, iframe, object, embed, link[rel='stylesheet'], meta, base, form",
    )
    .forEach((el) => el.remove());

  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (/^on/i.test(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (
        URL_ATTR_NAMES.some((allowed) => allowed === name) ||
        name === "srcdoc"
      ) {
        if (name === "srcdoc" || isDangerousUrl(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }
    }
  });

  return doc.body.innerHTML;
}

/**
 * Sanitize untrusted HTML before embedding in compose (quoted reply) or signatures.
 * Blocks script-bearing tags, event handlers, and dangerous URL protocols.
 */
export function sanitizeUntrustedEmailHtml(html: string): string {
  if (!html.trim()) {
    return "";
  }

  const withoutDangerousUrls = stripDangerousUrlProtocolsFromHtml(html);

  if (typeof DOMParser !== "undefined") {
    return sanitizeWithDomParser(withoutDangerousUrls);
  }

  return stripDangerousTagsRegex(withoutDangerousUrls);
}
