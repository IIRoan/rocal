import { createNativeExpoConfig } from "../../../../packages/native-core/expo-config.cjs";
import {
  prepareStoreRelease,
  selectStoreBuild,
} from "../../../../scripts/native-store-release";
import eas from "../../eas.json";

const commit = "a".repeat(40);
const config = {
  appConfig: createNativeExpoConfig("calendar", {
    SOLACE_APP_URL: "https://app.example.test",
  }),
  buildProfile: { channel: "testing", distribution: "store" },
};
const { release } = prepareStoreRelease(config, "calendar", "testflight", eas);
const build = {
  id: "12345678-1234-1234-1234-123456789abc",
  status: "FINISHED",
  platform: "IOS",
  distribution: "STORE",
  isForIosSimulator: false,
  app: { id: release.projectId },
  updateChannel: { name: release.channel },
  buildProfile: release.buildProfile,
  appIdentifier: release.appIdentifier,
  appVersion: release.appVersion,
  gitCommitHash: commit,
  artifacts: { buildUrl: "https://signed-download.example.test/private" },
};

describe("EAS store release selection", () => {
  it("keeps the exact selected build and excludes credentials/download URLs", () => {
    expect(selectStoreBuild([build], release, commit)).toEqual({
      ...release,
      id: build.id,
      gitCommitHash: commit,
    });
  });

  it.each([
    { status: "ERRORED" },
    { platform: "ANDROID" },
    { distribution: "INTERNAL" },
    { isForIosSimulator: true },
    { app: { id: "another-project" } },
    { updateChannel: { name: "master" } },
    { buildProfile: "production" },
    { appIdentifier: "onl.example.wrong" },
    { appVersion: "0.0.1" },
    { gitCommitHash: "b".repeat(40) },
    { id: "latest" },
  ])("rejects the wrong or unsuccessful build: %p", (change) => {
    expect(() =>
      selectStoreBuild([{ ...build, ...change }], release, commit),
    ).toThrow();
  });

  it("rejects ambiguous results and missing source provenance", () => {
    expect(() => selectStoreBuild([build, build], release, commit)).toThrow();
    expect(() => selectStoreBuild(build, release, "")).toThrow();
  });

  it("derives store URLs from the selected environment", () => {
    const { draft } = prepareStoreRelease(
      config,
      "calendar",
      "testflight",
      eas,
    );
    expect(draft.apple.info["en-US"].supportUrl).toBe(
      "https://app.example.test/support",
    );
    expect(draft.apple.info["en-US"].privacyPolicyUrl).toBe(
      "https://app.example.test/privacy",
    );
    expect(draft.apple.info["en-US"].title).toBe(config.appConfig.name);
  });

  it("rejects a different app, mismatched profile and private website", () => {
    expect(() =>
      prepareStoreRelease(config, "mail", "testflight", eas),
    ).toThrow();
    expect(() =>
      prepareStoreRelease(config, "calendar", "production", eas),
    ).toThrow();
    const privateConfig = {
      ...config,
      appConfig: createNativeExpoConfig("calendar", {
        SOLACE_APP_URL: "http://localhost:3000",
      }),
    };
    expect(() =>
      prepareStoreRelease(privateConfig, "calendar", "testflight", eas),
    ).toThrow();
  });
});
