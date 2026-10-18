import { describe, expect, it } from "@jest/globals";

import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
} from "../../lib/time-constants";

describe("time-constants", () => {
  it("matches expected millisecond values", () => {
    expect(MS_PER_SECOND).toBe(1000);
    expect(MS_PER_MINUTE).toBe(60_000);
    expect(MS_PER_HOUR).toBe(3_600_000);
    expect(MS_PER_DAY).toBe(86_400_000);
  });
});
