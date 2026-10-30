import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  nativeReleaseProfileMetadata,
  resolveNativeReleaseProfile,
} from "../../../../scripts/native-release-config";

describe("native build and update routing", () => {
  it.each([
    { event: "pull_request", branch: "123/merge", expected: "development" },
    { event: "push", branch: "master", expected: "preview" },
    { event: "push", branch: "testing", expected: "testing" },
    { event: "workflow_dispatch", branch: "feature", requested: "testing", expected: "testing" },
    { event: "workflow_dispatch", branch: "master", requested: "production", expected: "production" },
    { event: "workflow_dispatch", branch: "master", requested: "testflight", expected: "testflight" },
  ])("selects $expected for $event on $branch", ({ expected, ...input }) => {
    expect(resolveNativeReleaseProfile({ ...input, defaultBranch: "master", allowProduction: true })).toBe(expected);
  });

  it("uses the repository's actual default branch", () => {
    expect(resolveNativeReleaseProfile({ event: "push", branch: "release", defaultBranch: "release", allowProduction: false })).toBe("preview");
  });

  it.each([
    { event: "push", branch: "master", requested: "production", allowProduction: true, expected: "preview" },
    { event: "pull_request", branch: "123/merge", requested: "production", allowProduction: true, expected: "development" },
  ])("ignores production overrides on $event", ({ expected, ...input }) => {
    expect(resolveNativeReleaseProfile({ ...input, defaultBranch: "master" })).toBe(expected);
  });

  it.each(["testflight", "production"])("builds %s from a branch only as a dry run", (requested) => {
    const input = { event: "workflow_dispatch", branch: "feature", defaultBranch: "master", requested, allowProduction: true };
    expect(resolveNativeReleaseProfile({ ...input, dryRun: true })).toBe(requested);
    expect(() => resolveNativeReleaseProfile({ ...input, dryRun: false })).toThrow();
  });

  it.each([
    { event: "workflow_dispatch", branch: "feature", requested: "production", allowProduction: true },
    { event: "workflow_dispatch", branch: "feature", requested: "testflight", allowProduction: true },
    { event: "workflow_dispatch", branch: "master", requested: "production", allowProduction: false },
    { event: "workflow_dispatch", branch: "master", requested: "testflight", allowProduction: false, dryRun: true },
    { event: "push", branch: "feature", requested: "testflight", allowProduction: true, dryRun: true },
    { event: "workflow_dispatch", branch: "master", requested: "unknown", allowProduction: true },
    { event: "push", branch: "feature", allowProduction: true },
  ])("rejects unsupported or unsafe release requests: %p", (input) => {
    expect(() => resolveNativeReleaseProfile({ ...input, defaultBranch: "master" })).toThrow();
  });

  it.each(["native-calendar", "native-mail"])("aligns %s build and update targets from eas.json", (app) => {
    const eas: unknown = JSON.parse(readFileSync(resolve(__dirname, "../../../..", "apps", app, "eas.json"), "utf8"));
    expect(nativeReleaseProfileMetadata(eas, "development")).toEqual({ channel: "development", environment: "development", app_variant: "development" });
    expect(nativeReleaseProfileMetadata(eas, "testing")).toEqual({ channel: "testing", environment: "preview", app_variant: "preview" });
    expect(nativeReleaseProfileMetadata(eas, "testflight")).toEqual({ channel: "testing", environment: "preview", app_variant: "preview" });
    expect(nativeReleaseProfileMetadata(eas, "preview")).toEqual({ channel: "preview", environment: "preview", app_variant: "preview" });
    expect(nativeReleaseProfileMetadata(eas, "production")).toEqual({ channel: "master", environment: "production", app_variant: "production" });
  });
});
