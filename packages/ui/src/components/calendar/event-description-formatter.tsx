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

interface TeamsLink {
  index: number;
  end: number;
  label: string;
  url: string;
}

const TEAMS_LINK_URL = /^https?:\/\/[^>]/;

/** Finds Teams-style `Label<https://…>` links in one linear pass; the equivalent regex backtracks polynomially (CodeQL js/polynomial-redos). */
export function findTeamsLinks(line: string): TeamsLink[] {
  const links: TeamsLink[] = [];
  let labelStart = 0;
  let close = -1;
  for (let open = line.indexOf("<"); open !== -1; open = line.indexOf("<", open + 1)) {
    if (close <= open) {
      close = line.indexOf(">", open + 1);
      if (close === -1) break;
    }
    const url = line.slice(open + 1, close);
    if (open > labelStart && TEAMS_LINK_URL.test(url)) {
      links.push({ index: labelStart, end: close + 1, label: line.slice(labelStart, open), url });
      labelStart = close + 1;
      open = close;
    } else {
      labelStart = open + 1;
    }
  }
  return links;
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
    const urlOnlyRegex = /(https?:\/\/[^\s<>]+)/g;

    const parts = [];
    let lastIndex = 0;
    let match;

    // First check for Teams format links: "Text<URL>"
    for (const teams of findTeamsLinks(line)) {
      // Add text before the link
      if (teams.index > lastIndex) {
        parts.push(line.slice(lastIndex, teams.index));
      }

      const url = teams.url;
      const displayText = teams.label.trim() || linkLabel(url);

      parts.push(
        links ? (
          <a
            key={`${start}-teams-${teams.index}`}
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

      lastIndex = teams.end;
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
