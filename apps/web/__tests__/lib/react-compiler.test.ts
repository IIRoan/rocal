import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "@jest/globals";

const repoRoot = path.resolve(__dirname, "../../../..");
const requireFromRoot = createRequire(path.join(repoRoot, "package.json"));
const { findReactCompilerFailures } = requireFromRoot("./jest.react-compiler.cjs") as {
  findReactCompilerFailures: (dirs: string[], root: string) => string[];
};

describe("React Compiler", () => {
  it("compiles every web component and hook, since next.config.ts ships them without manual memoization", () => {
    const webRoot = path.join(repoRoot, "apps/web");
    const dirs = ["app", "components", "hooks", "lib"].map((dir) => path.join(webRoot, dir));
    expect(findReactCompilerFailures(dirs, repoRoot)).toEqual([]);
  }, 120_000);
});
