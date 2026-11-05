const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { existsSync } = require("node:fs");
const { createFingerprintAsync } = require("expo/fingerprint");

const root = path.join(__dirname, "../..");

async function checkApp(app) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "solace-fingerprint-"),
  );
  try {
    const nativeModule = path.join(
      directory,
      "node_modules/solace-fingerprint-native",
    );
    await fs.mkdir(path.join(nativeModule, "ios"), { recursive: true });
    await fs.symlink(
      path.dirname(require.resolve("expo/package.json")),
      path.join(directory, "node_modules/expo"),
    );
    await fs.writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({
        name: "solace-fingerprint-fixture",
        dependencies: {
          expo: require("expo/package.json").version,
          "solace-fingerprint-native": "1.0.0",
        },
      }),
    );
    await fs.writeFile(
      path.join(nativeModule, "package.json"),
      JSON.stringify({ name: "solace-fingerprint-native", version: "1.0.0" }),
    );
    await fs.writeFile(
      path.join(nativeModule, "expo-module.config.json"),
      JSON.stringify({
        platforms: ["apple"],
        apple: { modules: ["FixtureModule"] },
      }),
    );
    await fs.writeFile(
      path.join(nativeModule, "ios/Fixture.podspec"),
      'Pod::Spec.new do |s|\n s.name = "Fixture"\nend\n',
    );
    const nativeSource = path.join(nativeModule, "ios/Fixture.swift");
    await fs.writeFile(nativeSource, "let value = 1\n");
    const appConfig = {
      expo: {
        name: "Fixture",
        slug: "fixture",
        version: "1.0.6",
        runtimeVersion: { policy: "appVersion" },
      },
    };
    const configPath = path.join(directory, "app.json");
    await fs.writeFile(configPath, JSON.stringify(appConfig));
    const fingerprintConfig = path.join(
      root,
      `apps/native-${app}/fingerprint.config.js`,
    );
    if (existsSync(fingerprintConfig)) {
      await fs.writeFile(
        path.join(directory, "fingerprint.config.js"),
        `module.exports = require(${JSON.stringify(fingerprintConfig)});\n`,
      );
    }
    const options = { platforms: ["ios"], silent: true };
    const initial = await createFingerprintAsync(directory, options);
    appConfig.expo.version = "1.0.7";
    await fs.writeFile(configPath, JSON.stringify(appConfig));
    const versionChanged = await createFingerprintAsync(directory, options);
    assert.notEqual(
      versionChanged.hash,
      initial.hash,
      `${app}: an appVersion runtime change must build a new binary`,
    );
    await fs.writeFile(nativeSource, "let value = 2\n");
    const nativePatched = await createFingerprintAsync(directory, options);
    assert.notEqual(
      nativePatched.hash,
      versionChanged.hash,
      `${app}: a native patch must build a new binary`,
    );
    await fs.writeFile(
      path.join(directory, "index.js"),
      "export const value = 1;\n",
    );
    const jsOnly = await createFingerprintAsync(directory, options);
    assert.equal(
      jsOnly.hash,
      nativePatched.hash,
      `${app}: JavaScript-only changes stay eligible for OTA`,
    );
    console.log(
      `${app}: version changes and native patches rebuild; JavaScript-only changes do not`,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  for (const app of ["calendar", "mail"]) await checkApp(app);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
