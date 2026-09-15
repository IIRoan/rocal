import { describe, expect, it } from "@jest/globals";

import {
  MAIL_INVITATION_STAGING_CALENDAR_NAME,
  findPlaintextEventContentFields,
  isCalendarNameBackfillCandidate,
  isCategoryNameBackfillCandidate,
} from "../index";

describe("content encryption helpers", () => {
  it("finds non-empty plaintext event content fields", () => {
    expect(
      findPlaintextEventContentFields({
        title: "",
        description: "  ",
        location: "Clinic",
      }),
    ).toEqual(["location"]);
  });

  it("only backfills owned, user-named calendars with plaintext names", () => {
    const base = {
      name: "Personal",
      kind: "owned" as const,
      isVisible: true,
      isSyncOnly: false,
    };

    expect(isCalendarNameBackfillCandidate(base)).toBe(true);
    expect(isCalendarNameBackfillCandidate({ ...base, name: "" })).toBe(false);
    expect(
      isCalendarNameBackfillCandidate({
        ...base,
        kind: "subscribed",
        isSyncOnly: true,
      }),
    ).toBe(false);
    expect(
      isCalendarNameBackfillCandidate({
        ...base,
        name: MAIL_INVITATION_STAGING_CALENDAR_NAME,
        isVisible: false,
      }),
    ).toBe(false);
  });

  it("skips inactive or already-encrypted categories", () => {
    expect(isCategoryNameBackfillCandidate({ name: "Focus", isActive: true })).toBe(
      true,
    );
    expect(isCategoryNameBackfillCandidate({ name: "", isActive: true })).toBe(
      false,
    );
    expect(isCategoryNameBackfillCandidate({ name: "Old", isActive: false })).toBe(
      false,
    );
  });
});
