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
    input: `const assert = require("node:assert/strict");\n${source}`,
    timeout: 15_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
}

describe("security dependency compatibility", () => {
  it("decodes Expo Router query strings through the patched CommonJS adapter", () => {
    runDependencyCheck(`
      const queryString = require("query-string");
      assert.equal(queryString.parse("q=hello%20world").q, "hello world");
      assert.equal(queryString.parse("q=%E2%9C%93").q, "✓");
      assert.equal(queryString.parse("q=%E0%A4%A").q, "%E0%A4%A");
      assert.equal(queryString.parse("q=" + "%FE".repeat(5000)).q, "%FE".repeat(5000));
    `);
  });

  it("reads image dimensions with both Metro dependency trees", () => {
    runDependencyCheck(`
      const { createRequire } = require("node:module");
      const rootMetro = require.resolve("metro/package.json");
      const rnRequire = createRequire(require.resolve("@react-native/metro-config"));
      const configRequire = createRequire(rnRequire.resolve("metro-config"));
      const nativeMetro = configRequire.resolve("metro/package.json");
      const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6wXUAAAAASUVORK5CYII=", "base64");
      for (const entry of new Set([rootMetro, nativeMetro])) {
        const metroRequire = createRequire(entry);
        const assets = metroRequire("./src/Assets.js");
        assert.deepEqual(assets.getAssetSize("png", image, "test.png"), { width: 1, height: 1 });
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

  it("loads Prisma's config merger and React Doctor's TOML parser", () => {
    runDependencyCheck(`
      const { createRequire } = require("node:module");
      const prismaRequire = createRequire(require.resolve("@prisma/config"));
      const { deepmerge } = prismaRequire("deepmerge-ts");
      assert.deepEqual(deepmerge({ db: { host: "localhost" } }, { db: { port: 5432 } }), { db: { host: "localhost", port: 5432 } });
      const doctorRequire = createRequire(require.resolve("react-doctor"));
      const effectRequire = createRequire(doctorRequire.resolve("effect"));
      assert.equal(effectRequire("toml").parse('[scan]\\nenabled = true').scan.enabled, true);
    `);
  });

  it("serves the PDF worker shipped with the installed PDF.js release", () => {
    const installedWorker = path.join(
      path.dirname(requireFromRoot.resolve("pdfjs-dist/package.json")),
      "build/pdf.worker.min.mjs",
    );
    expect(
      readFileSync(path.join(repoRoot, "apps/web/public/pdf.worker.min.mjs")),
    ).toEqual(readFileSync(installedWorker));
  });
});
