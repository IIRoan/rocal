import { describe, expect, it } from "@jest/globals";

import { assertSupportedProductionRuntime } from "../../lib/runtime-version";

describe("production runtime versions", () => {
  it("checks the executing runtime when no version override is provided", () => {
    expect(() => assertSupportedProductionRuntime()).not.toThrow();
  });

  it.each(["22.23.4", "22.24.0", "24.22.1", "24.23.0", "26.12.1", "26.13.0"])(
    "accepts patched Node %s",
    (node) => {
      expect(() => assertSupportedProductionRuntime({ node })).not.toThrow();
    },
  );

  it.each([
    "22.23.3",
    "24.21.0",
    "26.12.0",
    "20.20.0",
    "28.0.0",
    "24.22.1-rc.1",
    "invalid",
  ])("rejects unsupported Node %s", (node) => {
    expect(() => assertSupportedProductionRuntime({ node })).toThrow(
      "Unsupported JavaScript runtime",
    );
  });

  it.each(["1.4.4", "1.5.0"])(
    "accepts patched Bun %s independently of its Node compatibility version",
    (bun) => {
      expect(() =>
        assertSupportedProductionRuntime({ node: "26.3.0", bun }),
      ).not.toThrow();
    },
  );

  it.each(["1.4.1", "1.4.3", "1.4.4-canary", ""])(
    "rejects unsupported Bun %s",
    (bun) => {
      expect(() =>
        assertSupportedProductionRuntime({ node: "26.12.1", bun }),
      ).toThrow("Unsupported JavaScript runtime");
    },
  );
});
