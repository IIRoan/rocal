import { createLogger } from "@workspace/logger";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const log = createLogger("test-runner", { timestamp: false });

interface TestSuite {
  name: string;
  cwd: string;
  command: string;
  args: string[];
}

interface SuiteResult {
  name: string;
  exitCode: number;
  passed: number;
  failed: number;
  total: number;
}

const rootDir = path.join(__dirname, "..");
const useCoverage = process.argv.includes("--coverage");
const summaryPath = process.argv.find((a) => a.startsWith("--summary="))?.split("=")[1];

const suites: TestSuite[] = [
  {
    name: "backend",
    cwd: path.join(rootDir, "apps", "backend"),
    command: "bun",
    args: useCoverage ? ["run", "test:coverage"] : ["run", "test"],
  },
  {
    name: "web",
    cwd: path.join(rootDir, "apps", "web"),
    command: "bun",
    args: useCoverage ? ["run", "test:coverage"] : ["run", "test"],
  },
  {
    name: "ui",
    cwd: path.join(rootDir, "packages", "ui"),
    command: "bun",
    args: useCoverage ? ["run", "test:coverage"] : ["run", "test"],
  },
  {
    name: "notifications",
    cwd: path.join(rootDir, "apps", "notifications"),
    command: "bun",
    args: useCoverage ? ["run", "test:coverage"] : ["run", "test"],
  },
  {
    name: "native",
    cwd: path.join(rootDir, "apps", "native"),
    command: "bun",
    args: useCoverage ? ["run", "test:coverage"] : ["run", "test"],
  },
];

function parseTestCounts(output: string): { passed: number; failed: number; total: number } {
  let passed = 0;
  let failed = 0;
  let total = 0;

  // Jest output: "Tests:       5 failed, 224 passed, 229 total"
  const jestMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed,\s+(\d+)\s+total/);
  if (jestMatch) {
    failed = parseInt(jestMatch[1] || "0", 10);
    passed = parseInt(jestMatch[2], 10);
    total = parseInt(jestMatch[3], 10);
    return { passed, failed, total };
  }

  // Go test output: count "ok" and "FAIL" lines
  const goOk = output.match(/^ok\s+/gm);
  const goFail = output.match(/^FAIL\s+/gm);
  if (goOk || goFail) {
    passed = goOk?.length ?? 0;
    failed = goFail?.length ?? 0;
    total = passed + failed;
    return { passed, failed, total };
  }

  return { passed: 0, failed: 0, total: 0 };
}

function runSuite(suite: TestSuite): Promise<SuiteResult> {
  return new Promise((resolve) => {
    const suiteLog = log.child(suite.name);
    suiteLog.step("Running tests...");

    const child = spawn(suite.command, suite.args, {
      cwd: suite.cwd,
      stdio: "pipe",
      shell: true,
    });

    let output = "";

    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      const exitCode = code ?? 1;
      const counts = parseTestCounts(output);

      if (exitCode === 0) {
        suiteLog.ok("Passed");
      } else {
        suiteLog.error(`Failed (exit code ${exitCode})`);
      }

      resolve({ name: suite.name, exitCode, ...counts });
    });
  });
}

async function main() {
  log.info(`Running ${suites.length} test suites${useCoverage ? " with coverage" : ""}...`);
  log.info(`Suites: ${suites.map((s) => s.name).join(", ")}\n`);

  const results: SuiteResult[] = [];

  for (const suite of suites) {
    const result = await runSuite(suite);
    results.push(result);
    console.log();
  }

  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const totalTests = results.reduce((sum, r) => sum + r.total, 0);
  const suitesPassed = results.filter((r) => r.exitCode === 0);
  const suitesFailed = results.filter((r) => r.exitCode !== 0);

  log.info("─".repeat(50));
  log.info("Test Summary:\n");

  for (const result of results) {
    const counts = result.total > 0 ? ` (${result.passed}/${result.total} tests)` : "";
    if (result.exitCode === 0) {
      log.ok(`  ${result.name}${counts}`);
    } else {
      log.error(`  ${result.name}${counts}`);
    }
  }

  console.log();

  if (totalTests > 0) {
    log.info(`Tests:  ${totalPassed} passed, ${totalFailed} failed, ${totalTests} total`);
  }
  log.info(`Suites: ${suitesPassed.length} passed, ${suitesFailed.length} failed, ${results.length} total`);

  console.log();

  if (summaryPath) {
    const allPassed = suitesFailed.length === 0;
    const lines: string[] = [
      "## Test Results",
      "",
      allPassed
        ? "> **All suites passed** :white_check_mark:"
        : "> **Some suites failed** :x:",
      "",
      "| Suite | Status | Tests |",
      "|-------|--------|-------|",
    ];

    for (const result of results) {
      const icon = result.exitCode === 0 ? ":white_check_mark:" : ":x:";
      const status = result.exitCode === 0 ? "Passed" : "Failed";
      const tests = result.total > 0 ? `${result.passed}/${result.total}` : "-";
      lines.push(`| ${result.name} | ${icon} ${status} | ${tests} |`);
    }

    lines.push("");
    if (totalTests > 0) {
      lines.push(`**Tests:** ${totalPassed} passed, ${totalFailed} failed, ${totalTests} total`);
    }
    lines.push(`**Suites:** ${suitesPassed.length} passed, ${suitesFailed.length} failed, ${results.length} total`);
    lines.push("");

    fs.writeFileSync(summaryPath, lines.join("\n"));
  }

  if (suitesFailed.length > 0) {
    log.error(`${suitesFailed.length} suite(s) failed`);
    process.exit(1);
  }

  log.ok("All suites passed");
}

main();
