/** Adds the iOS Notification Service Extension; the App Group id doubles as its keychain access group. */
const fs = require("fs");
const path = require("path");
const {
  withDangerousMod,
  withEntitlementsPlist,
  withXcodeProject,
} = require("expo/config-plugins");

const TARGET_NAME = "SolaceNotificationService";
const SWIFT_FILE = "NotificationService.swift";
const INFO_PLIST_FILE = `${TARGET_NAME}-Info.plist`;
const ENTITLEMENTS_FILE = `${TARGET_NAME}.entitlements`;
const APP_GROUPS_ENTITLEMENT = "com.apple.security.application-groups";

function extensionBundleIdentifier(appBundleIdentifier) {
  return `${appBundleIdentifier}.NotificationService`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function infoPlist({ version, buildNumber, appGroup, keychainService }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>${TARGET_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>${escapeXml(version)}</string>
  <key>CFBundleVersion</key>
  <string>${escapeXml(buildNumber)}</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
  </dict>
  <key>SolaceAppGroup</key>
  <string>${escapeXml(appGroup)}</string>
  <key>SolaceKeychainService</key>
  <string>${escapeXml(keychainService)}</string>
</dict>
</plist>
`;
}

function entitlementsPlist(appGroup) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>${APP_GROUPS_ENTITLEMENT}</key>
  <array>
    <string>${escapeXml(appGroup)}</string>
  </array>
</dict>
</plist>
`;
}

function withAppGroupEntitlement(config, { appGroup }) {
  return withEntitlementsPlist(config, (mod) => {
    const groups = new Set(mod.modResults[APP_GROUPS_ENTITLEMENT] ?? []);
    groups.add(appGroup);
    mod.modResults[APP_GROUPS_ENTITLEMENT] = [...groups];
    return mod;
  });
}

function withExtensionFiles(config, props) {
  return withDangerousMod(config, [
    "ios",
    async (mod) => {
      const targetDir = path.join(mod.modRequest.platformProjectRoot, TARGET_NAME);
      await fs.promises.mkdir(targetDir, { recursive: true });
      await fs.promises.copyFile(
        require.resolve(`./${SWIFT_FILE}`),
        path.join(targetDir, SWIFT_FILE),
      );
      await fs.promises.writeFile(
        path.join(targetDir, INFO_PLIST_FILE),
        infoPlist({
          version: mod.version ?? "1.0.0",
          buildNumber: mod.ios?.buildNumber ?? "1",
          appGroup: props.appGroup,
          keychainService: props.keychainService,
        }),
      );
      await fs.promises.writeFile(
        path.join(targetDir, ENTITLEMENTS_FILE),
        entitlementsPlist(props.appGroup),
      );
      return mod;
    },
  ]);
}

function withExtensionTarget(config, props) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    // `xcode` stores target names quoted, so match both spellings.
    if (
      project.pbxTargetByName(TARGET_NAME) ||
      project.pbxTargetByName(`"${TARGET_NAME}"`)
    ) {
      return mod;
    }

    const bundleIdentifier = mod.ios?.bundleIdentifier;
    if (!bundleIdentifier) {
      throw new Error("notification-service-extension: ios.bundleIdentifier is required");
    }

    // `xcode` assumes these sections exist when adding target dependencies.
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency ?? {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy ?? {};

    const group = project.addPbxGroup(
      [SWIFT_FILE, INFO_PLIST_FILE, ENTITLEMENTS_FILE],
      TARGET_NAME,
      TARGET_NAME,
    );
    const mainGroupId = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(group.uuid, mainGroupId);

    const target = project.addTarget(
      TARGET_NAME,
      "app_extension",
      TARGET_NAME,
      extensionBundleIdentifier(bundleIdentifier),
    );
    project.addBuildPhase([SWIFT_FILE], "PBXSourcesBuildPhase", "Sources", target.uuid);
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);
    project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);

    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const buildSettings = configurations[key]?.buildSettings;
      if (!buildSettings || buildSettings.PRODUCT_NAME !== `"${TARGET_NAME}"`) {
        continue;
      }
      buildSettings.CODE_SIGN_ENTITLEMENTS = `${TARGET_NAME}/${ENTITLEMENTS_FILE}`;
      buildSettings.CODE_SIGN_STYLE = "Automatic";
      buildSettings.INFOPLIST_FILE = `${TARGET_NAME}/${INFO_PLIST_FILE}`;
      buildSettings.IPHONEOS_DEPLOYMENT_TARGET = props.deploymentTarget;
      buildSettings.MARKETING_VERSION = mod.version ?? "1.0.0";
      buildSettings.CURRENT_PROJECT_VERSION = mod.ios?.buildNumber ?? "1";
      buildSettings.SWIFT_VERSION = "5.0";
      buildSettings.TARGETED_DEVICE_FAMILY = `"1,2"`;
      buildSettings.GENERATE_INFOPLIST_FILE = "NO";
      if (mod.ios?.appleTeamId) {
        buildSettings.DEVELOPMENT_TEAM = mod.ios.appleTeamId;
      }
    }
    if (mod.ios?.appleTeamId) {
      project.addTargetAttribute("DevelopmentTeam", mod.ios.appleTeamId, target);
    }
    return mod;
  });
}

function withNotificationServiceExtension(config, props) {
  if (!props?.appGroup || !props?.keychainService || !props?.deploymentTarget) {
    throw new Error(
      "notification-service-extension: appGroup, keychainService, and deploymentTarget are required",
    );
  }
  config = withAppGroupEntitlement(config, props);
  config = withExtensionFiles(config, props);
  config = withExtensionTarget(config, props);
  return config;
}

module.exports = withNotificationServiceExtension;
module.exports.TARGET_NAME = TARGET_NAME;
module.exports.extensionBundleIdentifier = extensionBundleIdentifier;
