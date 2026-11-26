import React, { type ReactNode } from "react";
import {
  getEventLinkLabel,
  splitEventDescription,
  type EventTextRun,
} from "@workspace/calendar-core";

function renderRuns(runs: EventTextRun[], links: boolean): ReactNode[] {
  const parts: ReactNode[] = [];
  // Runs only grow the offset, so it keys each link uniquely within its line.
  let offset = 0;
  for (const run of runs) {
    if (run.kind === "text") {
      parts.push(run.text);
      offset += run.text.length;
      continue;
    }
    const label = run.label ?? getEventLinkLabel(run.url);
    parts.push(
      links ? (
        <a
          key={offset}
          href={run.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:text-accent/80 underline"
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </a>
      ) : (
        label
      ),
    );
    offset += run.url.length;
  }
  return parts;
}

/** `links: false` is for previews rendered inside a button, where a nested link is unreachable. */
export const formatEventDescription = (
  description: string,
  { links = true }: { links?: boolean } = {},
) =>
  splitEventDescription(description).map(({ key, runs }) => (
    <div key={key} className="mb-1">
      {renderRuns(runs, links)}
    </div>
  ));
