import { readFileSync } from "node:fs";
import path from "node:path";

export const APP_URL = "http://localhost:4100";
export const API_URL = "http://localhost:4001";

type Fixture = {
  email: string;
  password: string;
  inviteToken: string;
  inviteEmail: string;
  invitePassword: string;
};

const FIXTURE_KEYS = ["email", "password", "inviteToken", "inviteEmail", "invitePassword"] as const;

/** The isolated run directory the native helpers also require; credentials and traces stay in its private/. */
export function e2eDirectory(): string {
  const directory = process.env.SOLACE_E2E_DIR ?? "";
  if (process.env.SOLACE_E2E !== "1" || !path.isAbsolute(directory) || path.basename(directory) !== "solace-e2e") {
    throw new Error("Set SOLACE_E2E=1 and SOLACE_E2E_DIR to an absolute, isolated solace-e2e directory");
  }
  return directory;
}

function isFixture(value: unknown): value is Fixture {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return FIXTURE_KEYS.every((key) => typeof record[key] === "string" && record[key] !== "");
}

/** Accounts written by `xtask e2e seed`; never log them. */
export function readFixture(): Fixture {
  const value: unknown = JSON.parse(readFileSync(path.join(e2eDirectory(), "private/fixture.json"), "utf8"));
  if (!isFixture(value)) throw new Error("private/fixture.json is missing seeded accounts; run xtask e2e seed");
  return value;
}
