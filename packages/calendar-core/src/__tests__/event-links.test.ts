import { describe, expect, it } from "@jest/globals";

import {
  findEventCallLink,
  findTeamsLinks,
  getEventLinkLabel,
  getEventLocationMapQuery,
  isVideoCallLink,
  splitEventDescription,
  splitEventTextLine,
} from "../event-links";

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

describe("splitEventTextLine", () => {
  it("splits bare URLs and leaves trailing punctuation as text", () => {
    expect(splitEventTextLine("See https://example.test/a, then (https://b.test).")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", url: "https://example.test/a", label: null },
      { kind: "text", text: ", then (" },
      { kind: "link", url: "https://b.test", label: null },
      { kind: "text", text: ")." },
    ]);
  });

  it("stays linear on a URL full of punctuation that is not at its end", () => {
    const hostile = `https://x.test/${"!".repeat(200_000)}a`;
    const started = performance.now();
    expect(splitEventTextLine(hostile)).toEqual([{ kind: "link", url: hostile, label: null }]);
    expect(splitEventTextLine("https://x.test/a!?).")).toEqual([
      { kind: "link", url: "https://x.test/a", label: null },
      { kind: "text", text: "!?)." },
    ]);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("prefers Teams-style labels", () => {
    expect(splitEventTextLine("Join<https://teams.microsoft.com/l/x> now")).toEqual([
      { kind: "link", url: "https://teams.microsoft.com/l/x", label: "Join" },
      { kind: "text", text: " now" },
    ]);
  });

  it("never links other schemes", () => {
    expect(splitEventTextLine("javascript:alert(1) data:text/html,x")).toEqual([
      { kind: "text", text: "javascript:alert(1) data:text/html,x" },
    ]);
  });
});

describe("splitEventDescription", () => {
  it("drops Google separators, boilerplate and blank lines", () => {
    const lines = splitEventDescription(
      "Agenda\n\n-::~:~::~:~:~:~:~:~:~:~::~:~::-\nPlease do not edit this section.\nhttps://x.test",
    );
    expect(lines.map((line) => line.runs)).toEqual([
      [{ kind: "text", text: "Agenda" }],
      [{ kind: "link", url: "https://x.test", label: null }],
    ]);
    expect(new Set(lines.map((line) => line.key)).size).toBe(2);
  });
});

describe("isVideoCallLink", () => {
  it("accepts known call hosts and their subdomains over https", () => {
    for (const url of [
      "https://meet.google.com/abc-defg-hij",
      "https://us02web.zoom.us/j/123?pwd=x",
      "https://zoom.us/j/1",
      "https://teams.microsoft.com/l/meetup-join/x",
      "https://teams.live.com/meet/1",
      "https://acme.whereby.com/room",
      "https://meet.jit.si/Room",
      "https://facetime.apple.com/join#v=1",
      "HTTPS://MEET.GOOGLE.COM/abc",
      "https://meet.google.com./abc",
      "https://meet.google.com:443/abc",
    ]) {
      expect(isVideoCallLink(url)).toBe(true);
    }
  });

  it("rejects http, other schemes, look-alikes and userinfo tricks", () => {
    for (const url of [
      "http://meet.google.com/abc",
      "javascript:alert('https://meet.google.com')",
      "data:text/html,https://meet.google.com",
      "https://meet.google.com.evil.test/abc",
      "https://evilzoom.us/j/1",
      "https://zoom.us.evil.test/j/1",
      "https://meet.google.com@evil.test/abc",
      "https://meet.google.com:pw@evil.test/abc",
      "https://evil.test/@meet.google.com",
      "https://evil.test#@meet.google.com",
      "https://evil.test?@meet.google.com",
      "https://evil.test\\@meet.google.com",
      "https://evil.test/meet.google.com",
    ]) {
      expect(isVideoCallLink(url)).toBe(false);
    }
  });
});

describe("findEventCallLink", () => {
  it("prefers the location, then the description", () => {
    expect(
      findEventCallLink({
        location: "Room 4 https://meet.google.com/aaa-bbbb-ccc",
        description: "https://zoom.us/j/1",
      }),
    ).toBe("https://meet.google.com/aaa-bbbb-ccc");
    expect(
      findEventCallLink({
        location: "Room 4",
        description: "Docs https://docs.test\nJoin<https://teams.microsoft.com/l/x>",
      }),
    ).toBe("https://teams.microsoft.com/l/x");
  });

  it("ignores events without a call link", () => {
    expect(findEventCallLink({ location: null, description: "http://meet.google.com/x" })).toBeNull();
    expect(findEventCallLink({})).toBeNull();
  });
});

describe("getEventLocationMapQuery", () => {
  it("returns a place but not a link or blank", () => {
    expect(getEventLocationMapQuery("  Damrak 1, Amsterdam ")).toBe("Damrak 1, Amsterdam");
    expect(getEventLocationMapQuery("https://zoom.us/j/1")).toBeNull();
    expect(getEventLocationMapQuery("Online: http://x.test")).toBeNull();
    expect(getEventLocationMapQuery("   ")).toBeNull();
    expect(getEventLocationMapQuery(null)).toBeNull();
  });
});

describe("getEventLinkLabel", () => {
  it("names the real host", () => {
    expect(getEventLinkLabel("https://meet.google.com@evil.test/x")).toBe("evil.test");
    expect(getEventLinkLabel("https://Docs.Example.test/a")).toBe("docs.example.test");
  });
});
