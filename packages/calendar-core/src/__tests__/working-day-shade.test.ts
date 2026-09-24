import { getWorkingDayShade } from "../date-utils";

describe("getWorkingDayShade", () => {
  const monToFri = [1, 2, 3, 4, 5];

  it("shades working days as workday", () => {
    expect(getWorkingDayShade(1, monToFri)).toBe("workday");
    expect(getWorkingDayShade(5, monToFri)).toBe("workday");
  });

  it("shades non-working Saturday and Sunday as weekend", () => {
    expect(getWorkingDayShade(0, monToFri)).toBe("weekend");
    expect(getWorkingDayShade(6, monToFri)).toBe("weekend");
  });

  it("treats a working Saturday as a workday", () => {
    expect(getWorkingDayShade(6, [1, 2, 3, 4, 5, 6])).toBe("workday");
  });

  it("leaves non-working weekdays unshaded", () => {
    expect(getWorkingDayShade(3, [1, 2, 4, 5])).toBeNull();
  });
});
