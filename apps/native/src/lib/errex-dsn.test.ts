import { describe, expect, it } from "@jest/globals";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { appVariant: "preview" },
    },
  },
}));

import { getErrexReportingOptions, parseErrexDsn } from "./errex-dsn";

describe("parseErrexDsn", () => {
  it("parses key, host, and string project name", () => {
    expect(
      parseErrexDsn(
        "https://65f1ae513c4a4865bc3b3384ce746653@errors.solace.onl/solace",
      ),
    ).toEqual({
      key: "65f1ae513c4a4865bc3b3384ce746653",
      host: "errors.solace.onl",
      project: "solace",
    });
  });

  it("returns null for empty or invalid input", () => {
    expect(parseErrexDsn("")).toBeNull();
    expect(parseErrexDsn("not-a-url")).toBeNull();
    expect(parseErrexDsn("https://errors.solace.onl/solace")).toBeNull();
  });
});

describe("getErrexReportingOptions", () => {
  it("returns null when DSN is unset", () => {
    expect(getErrexReportingOptions("")).toBeNull();
  });

  it("builds the errex tunnel URL and environment", () => {
    expect(
      getErrexReportingOptions(
        "https://65f1ae513c4a4865bc3b3384ce746653@errors.solace.onl/solace",
      ),
    ).toEqual({
      tunnel:
        "https://errors.solace.onl/api/solace/envelope/?sentry_key=65f1ae513c4a4865bc3b3384ce746653",
      environment: "preview",
    });
  });
});
