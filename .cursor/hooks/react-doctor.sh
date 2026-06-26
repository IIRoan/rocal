#!/bin/sh
# Cursor stop hook: run React Doctor on apps/web + packages/ui after each agent turn.
# Emits followup_message when diagnostics fail so the agent fixes them before finishing.
set -u

input_file=$(mktemp "${TMPDIR:-/tmp}/react-doctor-cursor-hook.XXXXXX")
output_file=$(mktemp "${TMPDIR:-/tmp}/react-doctor-cursor-hook-output.XXXXXX")
payload_file=$(mktemp "${TMPDIR:-/tmp}/react-doctor-cursor-hook-payload.XXXXXX")
json_file=$(mktemp "${TMPDIR:-/tmp}/react-doctor-cursor-hook-json.XXXXXX")
trap 'rm -f "$input_file" "$output_file" "$payload_file" "$json_file"' EXIT
cat > "$input_file"

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
project_root=${CURSOR_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-}}
if [ -z "$project_root" ]; then
  project_root=$(CDPATH= cd "$script_dir/../.." && pwd)
fi
if ! cd "$project_root"; then
  printf '%s\n' '{}'
  exit 0
fi

emit_hook_output() {
  node - "$input_file" "$payload_file" <<'NODE'
const fs = require('node:fs');
const [inputPath, payloadPath] = process.argv.slice(2);
const readJson = (path, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8') || '{}');
  } catch {
    return fallback;
  }
};

const input = readJson(inputPath, {});
const payload = readJson(payloadPath, {});
const eventName = input.hook_event_name || input.eventName || input.event_name || '';
const message = payload.message || payload.followup_message || '';

if (eventName === 'stop' || eventName === 'subagentStop') {
  if (payload.followup_message) {
    console.log(JSON.stringify({ followup_message: payload.followup_message }));
  } else {
    console.log('{}');
  }
  process.exit(0);
}

if (eventName === 'PostToolBatch') {
  if (!message) process.exit(0);
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolBatch',
        additionalContext: message,
      },
    }),
  );
  process.exit(0);
}

if (message) {
  console.log(JSON.stringify({ additional_context: message }));
}
NODE
}

should_scan() {
  node - "$input_file" <<'NODE'
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const inputPath = process.argv[2];
const editToolNames = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'ApplyPatch']);
const webUiPaths = ['apps/web', 'packages/ui'];
const reactFilePattern = /\.(tsx|jsx|ts|js)$/;

const readInput = () => {
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf8') || '{}');
  } catch {
    return {};
  }
};

const gitLines = (args) => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const filterReactPaths = (output) =>
  output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && reactFilePattern.test(line));

const hasWebUiReactChanges = () => {
  const unstaged = filterReactPaths(gitLines(['diff', '--name-only', '--', ...webUiPaths]));
  const staged = filterReactPaths(gitLines(['diff', '--name-only', '--cached', '--', ...webUiPaths]));
  const untracked = filterReactPaths(
    gitLines(['ls-files', '--others', '--exclude-standard', '--', ...webUiPaths]),
  );

  let branchChanges = [];
  const mergeBase =
    gitLines(['merge-base', 'HEAD', 'main']) || gitLines(['merge-base', 'HEAD', 'master']);
  if (mergeBase) {
    branchChanges = filterReactPaths(
      gitLines(['diff', '--name-only', `${mergeBase}...HEAD`, '--', ...webUiPaths]),
    );
  }

  return [...unstaged, ...staged, ...untracked, ...branchChanges].length > 0;
};

const input = readInput();
const eventName = input.hook_event_name || input.eventName || input.event_name || '';

if (eventName === 'stop' || eventName === 'subagentStop') {
  const status = input.status || 'completed';
  if (status === 'aborted') process.exit(10);
  process.exit(hasWebUiReactChanges() ? 0 : 10);
}

if (eventName === 'PostToolBatch') {
  const toolCalls = Array.isArray(input.tool_calls) ? input.tool_calls : [];
  const edited = toolCalls.some((toolCall) => editToolNames.has(toolCall.tool_name));
  process.exit(edited && hasWebUiReactChanges() ? 0 : 10);
}

const toolName = input.tool_name || input.toolName || input.tool;
if (!toolName || !editToolNames.has(toolName)) process.exit(10);
process.exit(hasWebUiReactChanges() ? 0 : 10);
NODE
}

run_react_doctor() {
  local json_file=$1
  local verbose_file=$2
  local exit_code=0

  if [ -x ./node_modules/.bin/react-doctor ]; then
    ./node_modules/.bin/react-doctor --project web,ui --json --diff --no-score >"$json_file" 2>"$verbose_file" || exit_code=$?
  elif command -v bun >/dev/null 2>&1; then
    bun x react-doctor@latest --project web,ui --json --diff --no-score >"$json_file" 2>"$verbose_file" || exit_code=$?
  elif command -v npx >/dev/null 2>&1; then
    npx --yes react-doctor@latest --project web,ui --json --diff --no-score >"$json_file" 2>"$verbose_file" || exit_code=$?
  else
    printf '%s\n' '{"summary":{"errorCount":0,"warningCount":0,"totalDiagnosticCount":0}}' >"$json_file"
    : >"$verbose_file"
    return 0
  fi

  node - "$json_file" "$exit_code" <<'NODE'
const fs = require('node:fs');
const [jsonPath, exitCode] = process.argv.slice(2);
try {
  const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8') || '{}');
  if (report.error && !report.projects && !report.diagnostics) process.exit(1);
  process.exit(0);
} catch {
  process.exit(Number(exitCode) === 0 ? 0 : 1);
}
NODE
}

has_blocking_diagnostics() {
  node - "$1" <<'NODE'
const fs = require('node:fs');
const reportPath = process.argv[2];
let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8') || '{}');
} catch {
  process.exit(10);
}

const diagnostics = Array.isArray(report.diagnostics)
  ? report.diagnostics
  : (report.projects || []).flatMap((project) => project.diagnostics || []);

const blocking = diagnostics.filter((diagnostic) => {
  if (diagnostic.severity === 'error') return true;
  if (diagnostic.severity !== 'warning') return false;
  const rule = String(diagnostic.rule || '');
  return !rule.startsWith('design-');
});

process.exit(blocking.length > 0 ? 0 : 10);
NODE
}

stage_untracked_react_files() {
  node <<'NODE'
const { execFileSync } = require('node:child_process');
const webUiPaths = ['apps/web', 'packages/ui'];
const reactFilePattern = /\.(tsx|jsx|ts|js)$/;

const gitLines = (args) => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const untracked = gitLines(['ls-files', '--others', '--exclude-standard', '--', ...webUiPaths])
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && reactFilePattern.test(line));

for (const filePath of untracked) {
  try {
    execFileSync('git', ['add', '-N', '--', filePath], { stdio: 'ignore' });
  } catch {
    // Best-effort: diff mode still works for tracked edits if staging fails.
  }
}
NODE
}

if ! should_scan; then
  printf '%s\n' '{}' > "$payload_file"
  emit_hook_output
  exit 0
fi

stage_untracked_react_files

if ! run_react_doctor "$json_file" "$output_file"; then
  printf '%s\n' '{}' > "$payload_file"
  emit_hook_output
  exit 0
fi

if ! has_blocking_diagnostics "$json_file"; then
  printf '%s\n' '{}' > "$payload_file"
  emit_hook_output
  exit 0
fi

node - "$json_file" "$output_file" "$payload_file" <<'NODE'
const fs = require('node:fs');
const [, , jsonPath, verbosePath, payloadPath] = process.argv;

const readJson = (path) => {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8') || '{}');
  } catch {
    return {};
  }
};

const report = readJson(jsonPath);
const verboseOutput = fs.readFileSync(verbosePath, 'utf8').trim();
const diagnostics = Array.isArray(report.diagnostics)
  ? report.diagnostics
  : (report.projects || []).flatMap((project) => project.diagnostics || []);

const blocking = diagnostics.filter((diagnostic) => {
  if (diagnostic.severity === 'error') return true;
  if (diagnostic.severity !== 'warning') return false;
  return !String(diagnostic.rule || '').startsWith('design-');
});

const lines = blocking.map((diagnostic) => {
  const location = diagnostic.filePath
    ? `${diagnostic.filePath}${diagnostic.line ? `:${diagnostic.line}` : ''}`
    : 'unknown';
  const icon = diagnostic.severity === 'error' ? '✗' : '⚠';
  return `${icon} ${diagnostic.plugin}/${diagnostic.rule}\n    ${diagnostic.message}\n    ${location}`;
});

const scanOutput = [verboseOutput, lines.join('\n\n')].filter(Boolean).join('\n\n');
const followup_message = [
  'React Doctor found issues in apps/web or packages/ui. Fix every diagnostic below before finishing this task.',
  'Use the react-doctor skill: fix errors first, then warnings. Only touch changed files unless a fix requires a small related edit.',
  'Document confirmed false positives in .react-doctor/false-positives.md instead of ignoring inline.',
  '',
  scanOutput,
].join('\n');

fs.writeFileSync(payloadPath, JSON.stringify({ message: followup_message, followup_message }));
NODE

emit_hook_output
exit 0
