const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const xcode = require("xcode");
const plugin = require("../../packages/native-core/plugins/notification-service-extension");

async function main() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "solace-extension-test-"),
  );
  try {
    const project = xcode.project(path.join(directory, "project.pbxproj"));
    project.hash = {
      project: {
        objects: {
          PBXProject: {
            PROJECT: {
              isa: "PBXProject",
              mainGroup: "MAIN",
              targets: [],
              attributes: {},
            },
            PROJECT_comment: "Project object",
          },
          PBXGroup: {
            MAIN: { isa: "PBXGroup", children: [], sourceTree: '"<group>"' },
          },
          PBXNativeTarget: {},
          PBXFileReference: {},
          PBXBuildFile: {},
          XCBuildConfiguration: {},
          XCConfigurationList: {},
        },
      },
    };
    project.addTarget(
      "Calendar",
      "application",
      "Calendar",
      "onl.example.calendar",
    );
    let config = plugin(
      {
        name: "Calendar",
        slug: "calendar",
        version: "1.0.1",
        ios: { bundleIdentifier: "onl.example.calendar", buildNumber: "27" },
      },
      {
        appGroup: "group.onl.example.calendar",
        keychainService: "onl.example.keys",
        deploymentTarget: "16.4",
      },
    );
    const request = { platformProjectRoot: directory };
    await config.mods.ios.dangerous({ ...config, modRequest: request });
    await config.mods.ios.xcodeproj({
      ...config,
      modResults: project,
      modRequest: request,
    });
    const targetId = project.findTargetKey('"' + plugin.TARGET_NAME + '"');
    const resources = project.pbxResourcesBuildPhaseObj(targetId);
    assert.equal(resources.files.length, 1);
    const manifest = await fs.readFile(
      path.join(directory, plugin.TARGET_NAME, "PrivacyInfo.xcprivacy"),
      "utf8",
    );
    assert.match(manifest, /NSPrivacyTracking<\/key>\s*<false\/>/);
    const extensionConfigurations = () =>
      Object.values(project.pbxXCBuildConfigurationSection()).filter(
        (value) =>
          value.buildSettings?.PRODUCT_NAME === '"' + plugin.TARGET_NAME + '"',
      );
    for (const { buildSettings } of extensionConfigurations()) {
      assert.equal(buildSettings.TARGETED_DEVICE_FAMILY, '"1"');
    }
    config.version = "1.0.2";
    config.ios.buildNumber = "28";
    config.ios.supportsTablet = true;
    await config.mods.ios.dangerous({ ...config, modRequest: request });
    await config.mods.ios.xcodeproj({
      ...config,
      modResults: project,
      modRequest: request,
    });
    assert.equal(resources.files.length, 1);
    const configurations = Object.values(
      project.pbxXCBuildConfigurationSection(),
    ).filter(
      (value) =>
        value.buildSettings?.PRODUCT_NAME === '"' + plugin.TARGET_NAME + '"',
    );
    assert.equal(configurations.length, 2);
    for (const { buildSettings } of configurations) {
      assert.equal(buildSettings.MARKETING_VERSION, "1.0.2");
      assert.equal(buildSettings.CURRENT_PROJECT_VERSION, "28");
      assert.equal(buildSettings.TARGETED_DEVICE_FAMILY, '"1,2"');
    }
    const info = await fs.readFile(
      path.join(
        directory,
        plugin.TARGET_NAME,
        plugin.TARGET_NAME + "-Info.plist",
      ),
      "utf8",
    );
    assert.match(info, /CFBundleVersion<\/key>\s*<string>28<\/string>/);
    assert.equal(
      Object.values(project.pbxNativeTargetSection()).filter(
        (value) => value.name,
      ).length,
      2,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
});
