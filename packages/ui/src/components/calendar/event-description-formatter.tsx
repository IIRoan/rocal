import React from "react";

// Google Calendar separator lines e.g. -::~:~::~:~:~:~:~:~:~:~::~:~::-
// They start and end with `-` and contain only `:` and `~` in between.
const GOOGLE_SEPARATOR_LINE = /^-[-:~]{10,}$/;
// Pure editor instruction — not meaningful to the event viewer
const EDITOR_BOILERPLATE_LINE = /^Please do not edit this section\.$/i;

/** Link text names the destination host, so several links in one description stay distinguishable. */
function linkLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** `links: false` is for previews rendered inside a button, where a nested link is unreachable. */
export const formatEventDescription = (
  description: string,
  { links = true }: { links?: boolean } = {},
) => {
  // Remove lines of underscores/dashes (typically 20+ characters)
  const cleanedDescription = description.replace(/_{20,}|[-_]{20,}/g, "");

  // Split into lines, strip Google boilerplate, filter out empty lines; each line's offset is its stable key.
  let offset = 0;
  const lines = cleanedDescription.split("\n").flatMap((line) => {
    const start = offset;
    offset += line.length + 1;
    const trimmed = line.trim();
    if (!trimmed) return [];
    if (GOOGLE_SEPARATOR_LINE.test(trimmed)) return [];
    if (EDITOR_BOILERPLATE_LINE.test(trimmed)) return [];
    return [{ line, start }];
  });

  return lines.map(({ line, start }) => {
    // Handle Teams meeting format: "Text<URL>"
    const teamsLinkRegex = /([^<]+)<(https?:\/\/[^>]+)>/g;
    const urlOnlyRegex = /(https?:\/\/[^\s<>]+)/g;

    const parts = [];
    let lastIndex = 0;
    let match;

    // First check for Teams format links
    while ((match = teamsLinkRegex.exec(line)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }

      const url = match[2] ?? "";
      const displayText = match[1]?.trim() || linkLabel(url);

      parts.push(
        links ? (
          <a
            key={`${start}-teams-${match.index}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent/80 underline"
            onClick={(e) => e.stopPropagation()}
          >
            {displayText}
          </a>
        ) : (
          displayText
        ),
      );

      lastIndex = match.index + match[0].length;
    }

    // If no Teams format links were found, check for standalone URLs
    if (parts.length === 0) {
      while ((match = urlOnlyRegex.exec(line)) !== null) {
        // Add text before the URL
        if (match.index > lastIndex) {
          parts.push(line.slice(lastIndex, match.index));
        }

        const url = match[0];
        parts.push(
          links ? (
            <a
              key={`${start}-url-${match.index}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent/80 underline"
              onClick={(e) => e.stopPropagation()}
            >
              {linkLabel(url)}
            </a>
          ) : (
            linkLabel(url)
          ),
        );

        lastIndex = match.index + match[0].length;
      }
    }

    // Add remaining text
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    // If no links were found, return the original line
    if (parts.length === 0) {
      parts.push(line);
    }

    return (
      <div key={start} className="mb-1">
        {parts}
      </div>
    );
  });
};
