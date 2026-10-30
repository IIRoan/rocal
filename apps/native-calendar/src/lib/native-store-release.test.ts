import { createNativeExpoConfig } from "../../../../packages/native-core/expo-config.cjs";
import { prepareStoreRelease } from "../../../../scripts/native-store-release";
import eas from "../../eas.json";

const config = {
  appConfig: createNativeExpoConfig("calendar", {
    SOLACE_APP_URL: "https://app.example.test",
  }),
  buildProfile: { channel: "testing", distribution: "store" },
};

describe("EAS store release preparation", () => {
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
