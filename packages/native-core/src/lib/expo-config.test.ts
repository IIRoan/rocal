import {
  createNativeExpoConfig,
  validateNativeBuildEnvironment,
} from "../../expo-config.cjs";

describe("shared native Expo configuration", () => {
  it.each(["calendar", "mail"] as const)(
    "uses the shared iPhone and encryption declarations in %s",
    (app) => {
      const config = createNativeExpoConfig(app, {});
      expect(config.ios?.supportsTablet).toBe(false);
      expect(config.ios?.infoPlist?.ITSAppUsesNonExemptEncryption).toBe(false);
      expect(
        config.ios?.infoPlist?.ITSEncryptionExportComplianceCode,
      ).toBeUndefined();
      expect(() =>
        createNativeExpoConfig(app, {
          SOLACE_IOS_ENCRYPTION_COMPLIANCE_CODE: " issued-code ",
        }),
      ).toThrow("requires iosUsesNonExemptEncryption: true");
    },
  );
  it("embeds the compliance code once the apps declare non-exempt encryption", () => {
    jest.isolateModules(() => {
      jest.doMock("../../expo-apps.json", () => ({
        ...jest.requireActual<object>("../../expo-apps.json"),
        iosUsesNonExemptEncryption: true,
      }));
      const { createNativeExpoConfig: create } = jest.requireActual<{
        createNativeExpoConfig: typeof createNativeExpoConfig;
      }>("../../expo-config.cjs");
      const infoPlist = create("mail", {
        SOLACE_IOS_ENCRYPTION_COMPLIANCE_CODE: " issued-code ",
      }).ios?.infoPlist;
      expect(infoPlist?.ITSAppUsesNonExemptEncryption).toBe(true);
      expect(infoPlist?.ITSEncryptionExportComplianceCode).toBe("issued-code");
    });
  });
  it.each(["calendar", "mail"] as const)(
    "declares no tracking in the %s app manifest",
    (app) => {
      expect(createNativeExpoConfig(app, {}).ios?.privacyManifests).toEqual({
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
      });
    },
  );
  it.each([
    {
      app: "calendar" as const,
      bundleId: "onl.solace.calendar",
      scheme: "solace",
    },
    {
      app: "mail" as const,
      bundleId: "onl.solace.mail",
      scheme: "solace-mail",
    },
  ])(
    "preserves the signed native identity when $app changes Expo projects",
    ({ app, bundleId, scheme }) => {
      const config = createNativeExpoConfig(app, {
        EXPO_OWNER: "another-owner",
        EXPO_PROJECT_SLUG: "another-project",
        EXPO_PROJECT_ID: "replacement-project-id",
      });
      expect(config.owner).toBe("another-owner");
      expect(config.slug).toBe("another-project");
      expect(config.extra?.eas.projectId).toBe("replacement-project-id");
      expect(config.updates?.url).toBe(
        "https://u.expo.dev/replacement-project-id",
      );
      expect(config.ios?.bundleIdentifier).toBe(bundleId);
      expect(config.android?.package).toBe(bundleId);
      expect(config.scheme).toBe(scheme);
    },
  );

  it("resolves shared EAS service variables into the public runtime config", () => {
    const config = createNativeExpoConfig("calendar", {
      SOLACE_API_URL: "https://api.example.test",
      SOLACE_APP_URL: "https://app.example.test",
      SOLACE_ENABLE_IOS_ASSOCIATED_DOMAINS: "true",
    });
    expect(config.extra?.runtimeEnvironment).toEqual({
      apiUrl: "https://api.example.test",
      appUrl: "https://app.example.test",
    });
    expect(config.ios?.associatedDomains).toEqual([
      "webcredentials:app.example.test",
    ]);
  });

  it("lets local overrides replace shared values", () => {
    const config = createNativeExpoConfig("mail", {
      SOLACE_API_URL: "https://shared.example.test",
      SOLACE_APP_URL: "https://shared.example.test",
      SOLACE_ENABLE_IOS_ASSOCIATED_DOMAINS: "true",
      EXPO_PUBLIC_API_URL: "https://local-api.example.test",
      EXPO_PUBLIC_APP_URL: "https://local.example.test",
      EXPO_ENABLE_IOS_ASSOCIATED_DOMAINS: "false",
    });
    expect(config.extra?.runtimeEnvironment).toEqual({
      apiUrl: "https://local-api.example.test",
      appUrl: "https://local.example.test",
    });
    expect(config.ios?.associatedDomains).toBeUndefined();
  });

  it("uses EAS values instead of a developer's local URLs when publishing", () => {
    const config = createNativeExpoConfig("calendar", {
      SOLACE_ENV_SOURCE: "eas",
      SOLACE_API_URL: "https://api.example.test",
      SOLACE_APP_URL: "https://app.example.test",
      SOLACE_ENABLE_IOS_ASSOCIATED_DOMAINS: "true",
      EXPO_PUBLIC_API_URL: "http://localhost:4001",
      EXPO_PUBLIC_APP_URL: "http://localhost:3000",
      PASSKEY_ORIGIN: "http://localhost:3000",
    });
    expect(config.extra?.runtimeEnvironment.apiUrl).toBe(
      "https://api.example.test",
    );
    expect(config.extra?.runtimeEnvironment.appUrl).toBe(
      "https://app.example.test",
    );
    expect(config.ios?.associatedDomains).toEqual([
      "webcredentials:app.example.test",
    ]);
    expect(
      createNativeExpoConfig("calendar", { SOLACE_ENV_SOURCE: "eas" }).extra
        ?.eas.projectId,
    ).toBeTruthy();
    expect(() => validateNativeBuildEnvironment({})).toThrow("SOLACE_API_URL");
    expect(() =>
      validateNativeBuildEnvironment({
        APP_VARIANT: "preview",
        SOLACE_API_URL: "https://api.example.test",
      }),
    ).toThrow("SOLACE_APP_URL");
  });

  it("preserves the previous Calendar dev-client scheme", () => {
    const config = createNativeExpoConfig("calendar", {
      APP_VARIANT: "development",
    });
    expect(config.scheme).toEqual(["solace-dev", "exp+solace"]);
    expect(config.ios?.bundleIdentifier).toBe("onl.solace.calendar.dev");
    expect(config.extra?.notificationExtension.appGroup).toBe(
      "group.onl.solace.calendar.dev",
    );
  });

  it("keeps the explicit runtime override for already installed binaries", () => {
    expect(createNativeExpoConfig("calendar", {}).runtimeVersion).toEqual({
      policy: "appVersion",
    });
    expect(
      createNativeExpoConfig("calendar", {
        EAS_UPDATE_RUNTIME_VERSION: "0.9.0",
      }).runtimeVersion,
    ).toBe("0.9.0");
  });

  it.each(["calendar", "mail"])(
    "isolates the %s E2E binary and disables remote updates",
    (app) => {
      const config = createNativeExpoConfig(app as "calendar" | "mail", {
        APP_VARIANT: "preview",
        SOLACE_E2E: "1",
        EXPO_PUBLIC_API_URL: "http://127.0.0.1:4001",
      });
      expect(config.ios?.bundleIdentifier).toBe(`onl.solace.${app}.e2e`);
      expect(config.android?.package).toBe(`onl.solace.${app}.e2e`);
      expect(config.extra?.notificationExtension.appGroup).toBe(
        `group.onl.solace.${app}.e2e`,
      );
      expect(config.updates?.enabled).toBe(false);
      expect(
        config.ios?.infoPlist?.NSAppTransportSecurity.NSAllowsArbitraryLoads,
      ).toBe(true);
      expect(config.plugins).toContainEqual([
        "expo-build-properties",
        {
          ios: { deploymentTarget: "16.4" },
          android: { usesCleartextTraffic: true },
        },
      ]);
    },
  );

  it.each([
    { APP_VARIANT: "production", EXPO_PUBLIC_API_URL: "http://127.0.0.1:4001" },
    { APP_VARIANT: "preview", EXPO_PUBLIC_API_URL: "https://api.solace.onl" },
    {
      APP_VARIANT: "preview",
      EXPO_PUBLIC_API_URL: "http://localhost.evil.test:4001",
    },
    {
      APP_VARIANT: "preview",
      EXPO_PUBLIC_API_URL: "http://localhost:4001",
      SOLACE_ENV_SOURCE: "eas",
    },
    { APP_VARIANT: "preview" },
  ])(
    "refuses an E2E binary outside the local isolated setup: %j",
    (environment) => {
      expect(() =>
        createNativeExpoConfig("calendar", { ...environment, SOLACE_E2E: "1" }),
      ).toThrow("E2E");
    },
  );

  it("rejects an unknown variant rather than silently creating a production identity", () => {
    expect(() =>
      createNativeExpoConfig("calendar", { APP_VARIANT: "developmnt" }),
    ).toThrow("APP_VARIANT");
  });
});
