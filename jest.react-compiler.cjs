const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const REACT_COMPILER_PLUGIN = "babel-plugin-react-compiler";

/** babel-jest options for the compiled apps: tests exercise the compiled hooks they ship, while test files stay uncompiled for jest.mock hoisting. */
const REACT_COMPILER_JEST_OPTIONS = {
  cwd: __dirname,
  overrides: [{ exclude: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"], plugins: [REACT_COMPILER_PLUGIN] }],
};

// The compiler deliberately skips components that use these libraries, so they keep manual memoization.
const ACCEPTED_REASONS = [/^Use of incompatible library/];

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name === "__tests__" ? [] : sourceFiles(file);
    }
    return /\.tsx?$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

/** Components and hooks under the given directories that the shipped React Compiler cannot compile. */
function findReactCompilerFailures(dirs, repoRoot) {
  const failures = [];
  for (const file of dirs.flatMap(sourceFiles)) {
    babel.transformSync(fs.readFileSync(file, "utf8"), {
      filename: file,
      babelrc: false,
      configFile: false,
      code: false,
      parserOpts: { plugins: file.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"] },
      plugins: [
        [
          REACT_COMPILER_PLUGIN,
          {
            panicThreshold: "none",
            logger: {
              logEvent(_filename, event) {
                if (event.kind !== "CompileError" && event.kind !== "PipelineError") return;
                const detail = event.detail ?? {};
                const reason = String(detail.reason ?? detail.options?.reason ?? event.data ?? "unknown");
                if (ACCEPTED_REASONS.some((accepted) => accepted.test(reason))) return;
                const line = detail.loc?.start?.line ?? detail.options?.loc?.start?.line ?? event.fnLoc?.start?.line;
                failures.push(`${path.relative(repoRoot, file)}:${line ?? "?"} ${reason}`);
              },
            },
          },
        ],
      ],
    });
  }
  return failures;
}

module.exports = { REACT_COMPILER_JEST_OPTIONS, findReactCompilerFailures };
