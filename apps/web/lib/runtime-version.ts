import { engines } from "../../../package.json";

type Version = readonly [number, number, number];

const NODE_MINIMUMS = engines.node
  .split(" || ")
  .map((range) =>
    range.startsWith("^") ? parseVersion(range.slice(1)) : null,
  );
const BUN_MINIMUM = engines.bun.startsWith(">=")
  ? parseVersion(engines.bun.slice(2))
  : null;

function parseVersion(value: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  const parsed: Version = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  return parsed.every(Number.isSafeInteger) ? parsed : null;
}

function atLeast(version: Version, minimum: Version): boolean {
  return (
    version[0] > minimum[0] ||
    (version[0] === minimum[0] && version[1] > minimum[1]) ||
    (version[0] === minimum[0] &&
      version[1] === minimum[1] &&
      version[2] >= minimum[2])
  );
}

export function assertSupportedProductionRuntime(
  versions: {
    node: string;
    bun?: string;
  } = process.versions,
): void {
  const version = parseVersion(versions.bun ?? versions.node);
  const minimum =
    versions.bun === undefined
      ? NODE_MINIMUMS.find((candidate) => candidate?.[0] === version?.[0])
      : BUN_MINIMUM;
  if (!version || !minimum || !atLeast(version, minimum)) {
    throw new Error("Unsupported JavaScript runtime");
  }
}
