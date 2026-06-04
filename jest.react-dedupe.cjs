const fs = require("fs");
const path = require("path");

/**
 * Jest resolves `react` from app-local node_modules while `react-dom` and
 * libraries like @tanstack/react-query often resolve from the repo root.
 * That loads two React copies and breaks hooks in jsdom tests.
 *
 * The repo root may also pin an older `react` than `react-dom`; prefer a
 * workspace copy that matches react-dom (currently apps/web or packages/ui).
 */
function createReactDedupeMapper(repoRoot) {
  const reactCandidates = [
    path.join(repoRoot, "apps/web/node_modules/react"),
    path.join(repoRoot, "packages/ui/node_modules/react"),
    path.join(repoRoot, "node_modules/react"),
  ];
  const reactRoot =
    reactCandidates.find((candidate) =>
      fs.existsSync(path.join(candidate, "package.json")),
    ) ?? reactCandidates[reactCandidates.length - 1];

  const reactDomRoot = path.join(repoRoot, "node_modules/react-dom");

  return {
    "^react$": reactRoot,
    "^react/jsx-runtime$": path.join(reactRoot, "jsx-runtime.js"),
    "^react/jsx-dev-runtime$": path.join(reactRoot, "jsx-dev-runtime.js"),
    "^react-dom$": reactDomRoot,
    "^react-dom/client$": path.join(reactDomRoot, "client.js"),
    "^react-dom/server.node$": path.join(reactDomRoot, "server.node.js"),
  };
}

module.exports = { createReactDedupeMapper };
