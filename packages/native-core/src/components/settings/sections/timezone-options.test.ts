import { TIMEZONE_GROUPS } from "./timezone-options";

describe("timezone picker options", () => {
  it.each(Object.values(TIMEZONE_GROUPS).flat())(
    "$label saves a zone Intl accepts",
    ({ value }) => {
      expect(
        () => new Intl.DateTimeFormat("en-US", { timeZone: value }),
      ).not.toThrow();
    },
  );
});
