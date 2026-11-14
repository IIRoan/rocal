import {
  DEFAULT_MAIL_LIST_SETTINGS,
  MAX_UNDO_TOAST_DURATION_MS,
  MIN_UNDO_TOAST_DURATION_MS,
  normalizeMailListSettings,
  parseMailListSettings,
  resolveMailAutoAdvanceTarget,
  resolveMarkAsReadDelayMs,
  serializeMailListSettings,
} from "../mail-list-settings";

describe("mail list settings", () => {
  it("falls back to defaults for missing or corrupt storage", () => {
    expect(parseMailListSettings(null)).toEqual(DEFAULT_MAIL_LIST_SETTINGS);
    expect(parseMailListSettings("{not json")).toEqual(DEFAULT_MAIL_LIST_SETTINGS);
    expect(parseMailListSettings("[1,2]")).toEqual(DEFAULT_MAIL_LIST_SETTINGS);
  });

  it("keeps valid fields and resets only the invalid ones", () => {
    const parsed = parseMailListSettings(
      JSON.stringify({
        density: "comfortable",
        markAsReadDelay: "sometimes",
        threadExpandInList: false,
        undoToastDurationMs: 10000,
        showLabelChipsInList: "yes",
      }),
    );
    expect(parsed).toEqual({
      ...DEFAULT_MAIL_LIST_SETTINGS,
      density: "comfortable",
      threadExpandInList: false,
      undoToastDurationMs: 10000,
    });
  });

  it("defaults auto-advance and swipes to today's behaviour and resets unknown values per field", () => {
    expect(DEFAULT_MAIL_LIST_SETTINGS).toMatchObject({
      autoAdvance: "next",
      swipeRight: "read",
      swipeLeft: "trash",
    });
    expect(
      normalizeMailListSettings({ autoAdvance: "list", swipeRight: "star", swipeLeft: "spam" }),
    ).toMatchObject({ autoAdvance: "list", swipeRight: "star", swipeLeft: "trash" });
    expect(normalizeMailListSettings({ autoAdvance: 1 }).autoAdvance).toBe("next");
  });

  it("keeps keys from a newer client", () => {
    const parsed = parseMailListSettings(JSON.stringify({ futureKey: "kept" }));
    expect(parseMailListSettings(serializeMailListSettings(parsed))).toMatchObject({
      futureKey: "kept",
    });
  });

  it("rejects undo durations outside the allowed window", () => {
    for (const undoToastDurationMs of [
      MIN_UNDO_TOAST_DURATION_MS - 1,
      MAX_UNDO_TOAST_DURATION_MS + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(
        normalizeMailListSettings({ undoToastDurationMs }).undoToastDurationMs,
      ).toBe(DEFAULT_MAIL_LIST_SETTINGS.undoToastDurationMs);
    }
    expect(
      normalizeMailListSettings({ undoToastDurationMs: MIN_UNDO_TOAST_DURATION_MS })
        .undoToastDurationMs,
    ).toBe(MIN_UNDO_TOAST_DURATION_MS);
  });

  it("round-trips through serialization", () => {
    const settings = {
      ...DEFAULT_MAIL_LIST_SETTINGS,
      density: "comfortable" as const,
      markAsReadDelay: "never" as const,
    };
    expect(parseMailListSettings(serializeMailListSettings(settings))).toEqual(
      settings,
    );
  });

  it("maps mark-as-read delays to milliseconds", () => {
    expect(resolveMarkAsReadDelayMs("instant")).toBe(0);
    expect(resolveMarkAsReadDelayMs("delayed")).toBe(3000);
    expect(resolveMarkAsReadDelayMs("never")).toBeNull();
  });

  it("resolves the auto-advance target without wrapping", () => {
    const ids = ["a", "b", "c", "d"];
    expect(resolveMailAutoAdvanceTarget(ids, ["b"], "b", "next")).toBe("c");
    expect(resolveMailAutoAdvanceTarget(ids, ["b"], "b", "previous")).toBe("a");
    expect(resolveMailAutoAdvanceTarget(ids, ["d"], "d", "next")).toBeNull();
    expect(resolveMailAutoAdvanceTarget(ids, ["a"], "a", "previous")).toBeNull();
    expect(resolveMailAutoAdvanceTarget(ids, ["b", "c"], "b", "next")).toBe("d");
    expect(resolveMailAutoAdvanceTarget(ids, ["c", "d"], "c", "next")).toBeNull();
    expect(resolveMailAutoAdvanceTarget(ids, ["b"], "b", "list")).toBeNull();
    expect(resolveMailAutoAdvanceTarget(ids, ["x"], "x", "next")).toBeNull();
  });
});
