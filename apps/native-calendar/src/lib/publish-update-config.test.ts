import {
  readEasBuildProfile,
  readEasUpdateTarget,
} from "../../../../scripts/eas-build-profile";

describe("EAS build profile validation", () => {
  it("preserves string env values and ignores unconsumed build options", () => {
    expect(
      readEasBuildProfile(
        {
          build: {
            preview: {
              channel: "preview",
              env: { APP_VARIANT: "preview" },
              ios: { image: "sdk-57" },
            },
          },
        },
        "preview",
      ),
    ).toEqual({
      channel: "preview",
      environment: undefined,
      env: { APP_VARIANT: "preview" },
    });
  });

  it.each([
    null,
    [],
    { build: [] },
    { build: {} },
    { build: { preview: [] } },
    { build: { preview: { env: [] } } },
    { build: { preview: { env: { APP_VARIANT: false } } } },
    { build: { preview: { channel: 1 } } },
    { build: { preview: { environment: {} } } },
  ])("rejects invalid or missing profiles: %p", (value) => {
    expect(readEasBuildProfile(value, "preview")).toBeNull();
  });

  it("inherits testing's environment and variant from its build profile", () => {
    expect(
      readEasUpdateTarget(
        {
          build: {
            preview: {
              channel: "preview",
              environment: "preview",
              env: { APP_VARIANT: "preview", SOLACE_ENV_SOURCE: "eas" },
            },
            testing: { extends: "preview", channel: "testing" },
          },
        },
        "testing",
      ),
    ).toEqual({
      profile: "testing",
      channel: "testing",
      environment: "preview",
      env: { APP_VARIANT: "preview", SOLACE_ENV_SOURCE: "eas" },
    });
  });

  it("reads renamed production channels and environments from eas.json", () => {
    expect(
      readEasUpdateTarget(
        {
          build: {
            production: { channel: "release", environment: "staging", env: {} },
          },
        },
        "master",
      ),
    ).toEqual({
      profile: "production",
      channel: "release",
      environment: "staging",
      env: {},
    });
  });

  it("rejects incomplete targets and cyclic inheritance", () => {
    expect(
      readEasUpdateTarget(
        { build: { preview: { channel: "preview" } } },
        "preview",
      ),
    ).toBeNull();
    expect(
      readEasBuildProfile(
        {
          build: {
            preview: { extends: "testing" },
            testing: { extends: "preview" },
          },
        },
        "preview",
      ),
    ).toBeNull();
  });
});
