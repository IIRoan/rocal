import { describe, expect, it } from "@jest/globals";
import {
  applyHiddenEventOptionalSections,
  clearedFieldsForDisabledEventSection,
} from "../event-optional-sections";

describe("clearedFieldsForDisabledEventSection", () => {
  it("clears the matching optional field for each event editor toggle", () => {
    expect(clearedFieldsForDisabledEventSection("location")).toEqual({
      location: "",
    });
    expect(clearedFieldsForDisabledEventSection("description")).toEqual({
      description: "",
    });
    expect(clearedFieldsForDisabledEventSection("recurrence")).toEqual({
      recurrence: null,
    });
    expect(clearedFieldsForDisabledEventSection("notifications")).toEqual({
      reminder: 0,
    });
    expect(clearedFieldsForDisabledEventSection("participants")).toEqual({
      participants: [],
    });
  });
});

describe("applyHiddenEventOptionalSections", () => {
  const filled = {
    description: "Agenda",
    location: "Office",
    participants: [{ email: "ada@example.com" }],
    recurrence: "FREQ=WEEKLY",
    reminder: 15,
    title: "Planning",
  };

  it("keeps selected values while those options stay enabled", () => {
    expect(
      applyHiddenEventOptionalSections(filled, {
        description: true,
        location: true,
        notifications: true,
        participants: true,
        recurrence: true,
      }),
    ).toEqual(filled);
  });

  it("drops selected values for disabled options so they are not saved", () => {
    expect(
      applyHiddenEventOptionalSections(filled, {
        description: false,
        location: false,
        notifications: false,
        participants: false,
        recurrence: false,
      }),
    ).toEqual({
      description: "",
      location: "",
      participants: [],
      recurrence: null,
      reminder: 0,
      title: "Planning",
    });
  });
});
