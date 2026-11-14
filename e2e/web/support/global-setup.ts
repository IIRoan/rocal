import { API_URL, APP_URL } from "./fixture";

/** Refuses a web build that would talk to a deployed API instead of the disposable loopback one. */
export default async function globalSetup() {
  const response = await fetch(`${APP_URL}/login`);
  const policy = response.headers.get("content-security-policy") ?? "";
  const connect = policy.split(";").find((directive) => directive.trim().startsWith("connect-src")) ?? "";
  if (!connect.split(/\s+/).includes(API_URL) || connect.includes("https://")) {
    throw new Error(`The web build must use NEXT_PUBLIC_API_URL=${API_URL}; rebuild apps/web with the E2E env`);
  }
}
