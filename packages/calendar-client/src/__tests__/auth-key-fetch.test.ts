import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createAuthKeyFetch } from "../auth-key-fetch";

const derive = (password: string, email: string) =>
  Promise.resolve(`key(${password}|${email})`);

let sent: Record<string, unknown>[];
let replies: Response[];
const fetchImpl = jest.fn(
  (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Promise.resolve(replies.shift() ?? new Response("{}"));
  },
);
const authFetch = createAuthKeyFetch(derive, fetchImpl);

function post(path: string, body: Record<string, unknown>) {
  return authFetch(`https://api.solace.test/api/auth${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function upgradeRequired() {
  return new Response(
    JSON.stringify({ code: "PASSWORD_UPGRADE_REQUIRED", message: "upgrade" }),
    { status: 400 },
  );
}

beforeEach(() => {
  sent = [];
  replies = [];
  fetchImpl.mockClear();
});

describe("createAuthKeyFetch", () => {
  it("signs in with the key instead of the password", async () => {
    await post("/sign-in/email", { email: "A@solace.test", password: "secret-pw" });

    expect(sent).toEqual([
      { email: "A@solace.test", password: "key(secret-pw|A@solace.test)" },
    ]);
  });

  it("sends the raw password once when the API still holds a legacy hash", async () => {
    replies = [upgradeRequired(), new Response("{}", { status: 200 })];

    const response = await post("/sign-in/email", {
      email: "a@solace.test",
      password: "secret-pw",
    });

    expect(response.status).toBe(200);
    expect(sent.map((body) => body.password)).toEqual([
      "key(secret-pw|a@solace.test)",
      "secret-pw",
    ]);
  });

  it("refuses a short new password without sending anything", async () => {
    const response = await post("/sign-up/email", {
      email: "a@solace.test",
      password: "short",
      name: "A",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "PASSWORD_TOO_SHORT",
      message: "Password too short",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never resends a new password raw", async () => {
    replies = [upgradeRequired(), new Response("{}", { status: 200 })];

    await post("/change-password", {
      email: "a@solace.test",
      currentPassword: "old-password",
      newPassword: "new-password",
    });

    expect(sent).toEqual([
      {
        email: "a@solace.test",
        currentPassword: "key(old-password|a@solace.test)",
        newPassword: "key(new-password|a@solace.test)",
      },
      {
        email: "a@solace.test",
        currentPassword: "old-password",
        newPassword: "key(new-password|a@solace.test)",
      },
    ]);
  });

  it("leaves other requests alone", async () => {
    await post("/update-user", { name: "password" });

    expect(sent).toEqual([{ name: "password" }]);
  });
});
