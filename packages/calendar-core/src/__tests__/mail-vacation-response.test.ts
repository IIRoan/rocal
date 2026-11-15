import {
  assertVacationResponseSet,
  buildVacationResponseGetCall,
  buildVacationResponseSetCall,
  parseVacationResponseGet,
  supportsVacationResponse,
  VACATION_REPLY_MAX_CHARS,
  VACATION_RESPONSE_CAPABILITY,
  vacationFormToUpdate,
  vacationResponseAccountId,
  vacationResponseToForm,
  validateVacationForm,
  type MailVacationForm,
} from "../mail-vacation-response";

const TZ = "Europe/Amsterdam";
const form = (patch: Partial<MailVacationForm> = {}): MailVacationForm => ({
  enabled: true,
  fromDay: "2026-10-23",
  toDay: "2026-10-26",
  subject: "Away",
  text: "Back on Tuesday.",
  ...patch,
});

describe("vacation response form", () => {
  it("writes whole days in the user's zone across the October DST change, with an exclusive end", () => {
    const update = vacationFormToUpdate(form(), TZ);
    expect(update).toEqual({
      isEnabled: true,
      fromDate: "2026-10-22T22:00:00Z",
      toDate: "2026-10-26T23:00:00Z",
      subject: "Away",
      textBody: "Back on Tuesday.",
      htmlBody: null,
    });
    expect(vacationResponseToForm({ id: "singleton", ...update }, TZ)).toEqual(form());
  });

  it("always writes text only and lets a blank subject and empty days fall back", () => {
    const update = vacationFormToUpdate(form({ fromDay: "", toDay: "", subject: "  " }), TZ);
    expect(update).toMatchObject({ fromDate: null, toDate: null, subject: null, htmlBody: null });
    expect(vacationFormToUpdate(form({ enabled: false, text: "" }), TZ).textBody).toBeNull();
  });

  it("refuses an enabled reply without text, over-long text and reversed days", () => {
    expect(validateVacationForm(form({ text: "   " }))).toMatchObject({ field: "text" });
    expect(() => vacationFormToUpdate(form({ text: "x".repeat(VACATION_REPLY_MAX_CHARS + 1) }), TZ)).toThrow(
      "Keep the message under 5,000 characters.",
    );
    expect(validateVacationForm(form({ toDay: "2026-10-01" }))).toMatchObject({ field: "toDay" });
    expect(validateVacationForm(form({ fromDay: "2026-02-30" }))).toMatchObject({ field: "fromDay" });
    expect(validateVacationForm(form())).toBeNull();
  });

  it("refuses date-times as days, so the reply always gets an end", () => {
    expect(validateVacationForm(form({ toDay: "2026-11-20T18:00" }))).toMatchObject({ field: "toDay" });
    expect(validateVacationForm(form({ fromDay: "2026-10-23T08:00" }))).toMatchObject({ field: "fromDay" });
    expect(validateVacationForm(form({ toDay: "2026-13-01" }))).toMatchObject({ field: "toDay" });
    expect(() => vacationFormToUpdate(form({ toDay: "2026-11-20T18:00" }), TZ)).toThrow("Use dates like 2026-11-14.");
  });

  it("ends the reply after the last day across month and year ends", () => {
    expect(vacationFormToUpdate(form({ fromDay: "", toDay: "2026-12-31" }), TZ).toDate).toBe("2026-12-31T23:00:00Z");
    expect(vacationFormToUpdate(form({ fromDay: "", toDay: "2028-02-28" }), TZ).toDate).toBe("2028-02-28T23:00:00Z");
  });

  it("starts empty when the account has no reply yet", () => {
    expect(vacationResponseToForm(null, TZ)).toEqual({ enabled: false, fromDay: "", toDay: "", subject: "", text: "" });
  });
});

describe("vacation response JMAP", () => {
  const session = {
    capabilities: { [VACATION_RESPONSE_CAPABILITY]: {} },
    primaryAccounts: { [VACATION_RESPONSE_CAPABILITY]: "v" },
  };

  it("gates on the session capability and prefers its account", () => {
    expect(supportsVacationResponse(session)).toBe(true);
    expect(supportsVacationResponse({ capabilities: {} })).toBe(false);
    expect(supportsVacationResponse({})).toBe(false);
    expect(vacationResponseAccountId(session, "mail")).toBe("v");
    expect(vacationResponseAccountId({ primaryAccounts: {} }, "mail")).toBe("mail");
  });

  it("builds the singleton calls", () => {
    expect(buildVacationResponseGetCall("a")).toEqual(["VacationResponse/get", { accountId: "a", ids: ["singleton"] }, "v1"]);
    const update = vacationFormToUpdate(form(), TZ);
    expect(buildVacationResponseSetCall("a", update)).toEqual([
      "VacationResponse/set",
      { accountId: "a", update: { singleton: update } },
      "v1",
    ]);
  });

  it("parses replies and rejects hostile shapes", () => {
    expect(parseVacationResponseGet({ list: [{ id: "singleton", isEnabled: false, extra: 1 }] })).toEqual({
      id: "singleton",
      isEnabled: false,
    });
    expect(parseVacationResponseGet({ list: [] })).toBeNull();
    expect(() => parseVacationResponseGet({ list: [{ id: "singleton", isEnabled: "yes" }] })).toThrow();
    expect(() => parseVacationResponseGet(null)).toThrow();
  });

  it("surfaces a refused save", () => {
    expect(() => assertVacationResponseSet({ updated: { singleton: null } })).not.toThrow();
    expect(() =>
      assertVacationResponseSet({ notUpdated: { singleton: { type: "invalidProperties", description: "Field could not be set." } } }),
    ).toThrow("Field could not be set.");
    expect(() => assertVacationResponseSet({})).toThrow("Couldn't save the auto-reply.");
  });
});
