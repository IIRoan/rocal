import { readEasBuildProfile } from "../../../../scripts/eas-build-profile";

describe("EAS build profile validation", () => {
  it("preserves string env values and ignores unconsumed build options", () => {
    expect(readEasBuildProfile({
      build: { preview: { channel: "preview", env: { APP_VARIANT: "preview" }, ios: { image: "sdk-57" } } },
    }, "preview")).toEqual({
      channel: "preview", environment: undefined, env: { APP_VARIANT: "preview" },
    });
  });

  it.each([null, [], { build: [] }, { build: {} }, { build: { preview: [] } },
    { build: { preview: { env: [] } } },
    { build: { preview: { env: { APP_VARIANT: false } } } },
    { build: { preview: { channel: 1 } } },
    { build: { preview: { environment: {} } } },
  ])("rejects invalid or missing profiles: %p", (value) => {
    expect(readEasBuildProfile(value, "preview")).toBeNull();
  });
});
