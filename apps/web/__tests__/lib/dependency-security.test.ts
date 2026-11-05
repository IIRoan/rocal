import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "@jest/globals";

const repoRoot = path.resolve(__dirname, "../../../..");
const requireFromRoot = createRequire(path.join(repoRoot, "package.json"));

function runDependencyCheck(source: string) {
  const result = spawnSync(process.execPath, ["--input-type=commonjs", "-"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: `const assert = require("node:assert/strict");\n(async () => {${source}})().catch(error => { console.error(error); process.exitCode = 1; });`,
    timeout: 15_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
}

describe("dependency compatibility", () => {
  it("decodes Expo Router deep links without the retired query-string adapter", () => {
    runDependencyCheck(`
      const { getStateFromPath } = require("expo-router/build/fork/getStateFromPath");
      const parse = (query) => {
        const state = getStateFromPath("/event/event-1?" + query, { screens: { event: "event/:id" } });
        assert.equal(state.routes[0].params.id, "event-1");
        return state.routes[0].params;
      };
      assert.equal(parse("q=hello%20world").q, "hello world");
      assert.equal(parse("q=%E2%9C%93").q, "✓");
      assert.equal(parse("q=%E0%A4%A").q, "�%A");
      assert.equal(parse("q=" + "%FE".repeat(5000)).q, "�".repeat(5000));
    `);
  });

  it("reads image buffers and Expo file assets with both Metro dependency trees", () => {
    runDependencyCheck(`
      const { createRequire } = require("node:module");
      const path = require("node:path");
      const fs = require("node:fs");
      const expoRequire = createRequire(require.resolve("@expo/metro/package.json"));
      const rootMetro = expoRequire.resolve("metro/package.json");
      const rnRequire = createRequire(require.resolve("@react-native/metro-config"));
      const configRequire = createRequire(rnRequire.resolve("metro-config"));
      const nativeMetro = configRequire.resolve("metro/package.json");
      const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6wXUAAAAASUVORK5CYII=", "base64");
      const assetPath = path.join(path.dirname(require.resolve("expo-router/package.json")), "assets/pkg.png");
      for (const entry of new Set([rootMetro, nativeMetro])) {
        const metroRequire = createRequire(entry);
        const assets = metroRequire("./src/Assets.js");
        assert.deepEqual(assets.getAssetSize("png", image, "test.png"), { width: 1, height: 1 });
        const expected = assets.getAssetSize("png", fs.readFileSync(assetPath), assetPath);
        const actual = await assets.getAssetData(assetPath, "assets/pkg.png", [], "ios", "/assets");
        assert.equal(actual.width, expected.width);
        assert.equal(actual.height, expected.height);
      }
      const { getUniversalAssetData } = require("@expo/metro-config/build/transform-worker/getAssets");
      for (const platform of ["ios", "android"]) {
        const actual = await getUniversalAssetData(assetPath, "assets/pkg.png", [], platform, "/assets");
        assert.ok(actual.width > 0 && actual.height > 0);
        assert.equal(actual.fileHashes.length, actual.files.length);
      }
    `);
  });

  it("generates native Xcode project ids with the scoped UUID override", () => {
    runDependencyCheck(`
      const project = require("xcode").project("test.pbxproj");
      project.hash = { project: { objects: {} } };
      const first = project.generateUuid();
      assert.match(first, /^[A-F0-9]{24}$/);
      assert.notEqual(first, project.generateUuid());
    `);
  });

  it("serves the PDF worker shipped with the installed PDF.js release", () => {
    const installedWorker = path.join(
      path.dirname(requireFromRoot.resolve("pdfjs-dist/package.json")),
      "build/pdf.worker.min.mjs",
    );
    expect(
      readFileSync(
        path.join(repoRoot, "apps/web/public/pdf.worker.min.mjs"),
      ).equals(readFileSync(installedWorker)),
    ).toBe(true);
  });
});
