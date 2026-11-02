import { describe, expect, it } from "@jest/globals";

import { findTeamsLinks } from "./event-description-formatter";

describe("findTeamsLinks", () => {
  it("reads a Teams-style label and URL", () => {
    expect(findTeamsLinks("Join the meeting<https://teams.microsoft.com/l/abc> now")).toEqual([
      { index: 0, end: 51, label: "Join the meeting", url: "https://teams.microsoft.com/l/abc" },
    ]);
  });

  it("finds consecutive links and skips angle brackets that hold no URL", () => {
    expect(findTeamsLinks("a<b> Docs<http://x.test> More<https://y.test>")).toEqual([
      { index: 2, end: 24, label: "b> Docs", url: "http://x.test" },
      { index: 24, end: 45, label: " More", url: "https://y.test" },
    ]);
  });

  it("needs a label and a closing bracket", () => {
    expect(findTeamsLinks("<https://x.test>")).toEqual([]);
    expect(findTeamsLinks("Label<https://x.test")).toEqual([]);
  });

  it("stays linear on input that made the old regex backtrack", () => {
    const hostile = [";<http://".repeat(50_000), ";".repeat(200_000), "<".repeat(200_000) + ">"];
    const started = performance.now();
    for (const line of hostile) findTeamsLinks(line);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
