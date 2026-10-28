import { describe, expect, it } from "@jest/globals";
import { getErrexReportingOptions, parseErrexDsn } from "./errex-dsn";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { appVariant: "preview" },
    },
  },
}));

describe("parseErrexDsn", () => {
  it("parses key, host, and string project name", () => {
    expect(
      parseErrexDsn(
        "https://fixture-public-key@reports.example.test/solace",
      ),
    ).toEqual({
      key: "fixture-public-key",
      host: "reports.example.test",
      project: "solace",
    });
  });

  it("returns null for empty or invalid input", () => {
    expect(parseErrexDsn("")).toBeNull();
    expect(parseErrexDsn("not-a-url")).toBeNull();
    expect(parseErrexDsn("https://reports.example.test/solace")).toBeNull();
  });
});

describe("getErrexReportingOptions", () => {
  it("returns null when DSN is unset", () => {
    expect(getErrexReportingOptions("")).toBeNull();
  });

  it("builds the errex tunnel URL and environment", () => {
    expect(
      getErrexReportingOptions(
        "https://fixture-public-key@reports.example.test/solace",
      ),
    ).toEqual({
      tunnel:
        "https://reports.example.test/api/solace/envelope/?sentry_key=fixture-public-key",
      environment: "preview",
    });
  });
});
