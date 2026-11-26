import { getLinkHost } from "./mail-links";

export type EventTextRun =
  | { kind: "text"; text: string }
  | { kind: "link"; url: string; label: string | null };

export type EventDescriptionLine = { key: number; runs: EventTextRun[] };

interface TeamsLink {
  index: number;
  end: number;
  label: string;
  url: string;
}

// Google Calendar separator lines e.g. -::~:~::~:~:~:~:~:~:~:~::~:~::-
const GOOGLE_SEPARATOR_LINE = /^-[-:~]{10,}$/;
const EDITOR_BOILERPLATE_LINE = /^Please do not edit this section\.$/i;
const TEAMS_LINK_URL = /^https?:\/\/[^>]/;
const BARE_URL = /https?:\/\/[^\s<>]+/g;
const TRAILING_PUNCTUATION = ".,;:!?)]'\"";
const HTTPS_URL = /^https:\/\//i;
const CALL_HOSTS = [
  "meet.google.com",
  "zoom.us",
  "zoom.com",
  "teams.microsoft.com",
  "teams.live.com",
  "whereby.com",
  "meet.jit.si",
  "facetime.apple.com",
];

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

/** Scans back from the end; an unanchored `[…]+$` regex is quadratic on long punctuation runs (CodeQL js/polynomial-redos). */
function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0 && TRAILING_PUNCTUATION.includes(url.charAt(end - 1))) end -= 1;
  return url.slice(0, end);
}

function bareUrlRuns(line: string): EventTextRun[] {
  const runs: EventTextRun[] = [];
  let lastIndex = 0;
  for (const match of line.matchAll(BARE_URL)) {
    const url = trimTrailingPunctuation(match[0]);
    const start = match.index;
    if (start > lastIndex) runs.push({ kind: "text", text: line.slice(lastIndex, start) });
    runs.push({ kind: "link", url, label: null });
    lastIndex = start + url.length;
  }
  if (lastIndex < line.length) runs.push({ kind: "text", text: line.slice(lastIndex) });
  return runs;
}

/** One line as text and http(s) link runs: Teams-style `Label<url>` links when present, bare URLs otherwise. */
export function splitEventTextLine(line: string): EventTextRun[] {
  const teamsLinks = findTeamsLinks(line);
  if (teamsLinks.length === 0) return bareUrlRuns(line);
  const runs: EventTextRun[] = [];
  let lastIndex = 0;
  for (const link of teamsLinks) {
    if (link.index > lastIndex) runs.push({ kind: "text", text: line.slice(lastIndex, link.index) });
    runs.push({ kind: "link", url: link.url, label: link.label.trim() || null });
    lastIndex = link.end;
  }
  if (lastIndex < line.length) runs.push({ kind: "text", text: line.slice(lastIndex) });
  return runs;
}

/** The description's visible lines as runs, without Google's separator and boilerplate lines; each key is a stable line offset. */
export function splitEventDescription(description: string): EventDescriptionLine[] {
  const cleaned = description.replace(/_{20,}|[-_]{20,}/g, "");
  const lines: EventDescriptionLine[] = [];
  let offset = 0;
  for (const line of cleaned.split("\n")) {
    const key = offset;
    offset += line.length + 1;
    const trimmed = line.trim();
    if (!trimmed || GOOGLE_SEPARATOR_LINE.test(trimmed) || EDITOR_BOILERPLATE_LINE.test(trimmed)) continue;
    lines.push({ key, runs: splitEventTextLine(line) });
  }
  return lines;
}

/** A link's host for display; links are shown by destination so several stay distinguishable. */
export function getEventLinkLabel(url: string): string {
  return getLinkHost(url) ?? url;
}

/** Only https links whose real host (after any `user@`) is a known call service or its subdomain. */
export function isVideoCallLink(url: string): boolean {
  if (!HTTPS_URL.test(url)) return false;
  const host = getLinkHost(url);
  return host !== null && CALL_HOSTS.some((callHost) => host === callHost || host.endsWith(`.${callHost}`));
}

/** The first video-call link in the location, then the description. */
export function findEventCallLink(event: {
  location?: string | null;
  description?: string | null;
}): string | null {
  for (const text of [event.location, event.description]) {
    if (!text) continue;
    for (const line of text.split("\n")) {
      for (const run of splitEventTextLine(line)) {
        if (run.kind === "link" && isVideoCallLink(run.url)) return run.url;
      }
    }
  }
  return null;
}

/** The place to search a map for, or null when the location is empty or a link. */
export function getEventLocationMapQuery(location: string | null | undefined): string | null {
  const query = location?.trim();
  if (!query || /https?:\/\//i.test(query)) return null;
  return query;
}
