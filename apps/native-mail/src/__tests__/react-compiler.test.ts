import { createRequire } from "node:module";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../../..");
const requireFromRoot = createRequire(path.join(repoRoot, "package.json"));
const { findReactCompilerFailures } = requireFromRoot("./jest.react-compiler.cjs") as {
  findReactCompilerFailures: (dirs: string[], root: string) => string[];
};

describe("React Compiler", () => {
  it("compiles every Solace Mail component and hook, since app.config.ts ships them without manual memoization", () => {
    const appRoot = path.join(repoRoot, "apps/native-mail");
    const dirs = ["app", "src"].map((dir) => path.join(appRoot, dir));
    expect(findReactCompilerFailures(dirs, repoRoot)).toEqual([]);
  }, 120_000);
});
