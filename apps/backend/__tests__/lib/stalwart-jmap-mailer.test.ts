import { describe, expect, it, jest } from "@jest/globals";
import {
  pickIdentity,
  pickMailbox,
  rewriteToPublicOrigin,
  sendTransactionalEmailViaStalwart,
} from "../../lib/stalwart-jmap-mailer";

describe("stalwart-jmap-mailer helpers", () => {
  it("picks drafts and identity case-insensitively", () => {
    expect(
      pickMailbox(
        [
          { id: "inbox", role: "inbox", name: "Inbox" },
          { id: "drafts", role: "drafts", name: "Drafts" },
        ],
        "drafts",
      )?.id,
    ).toBe("drafts");
    expect(
      pickIdentity(
        [{ id: "id-1", email: "noreply@solace.onl" }],
        "NOREPLY@solace.onl",
      )?.id,
    ).toBe("id-1");
  });

  it("rewrites internal api hosts onto the public origin", () => {
    expect(
      rewriteToPublicOrigin(
        "http://stalwart.internal:8080/jmap/",
        "https://mail.solace.onl",
      ),
    ).toBe("https://mail.solace.onl/jmap/");
  });
});

describe("sendTransactionalEmailViaStalwart", () => {
  it("discovers session, loads identity, and submits Email/set + EmailSubmission/set", async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetcher = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method,
        body: typeof init?.body === "string" ? init.body : undefined,
      });

      if (url.endsWith("/jmap/session")) {
        return new Response(
          JSON.stringify({
            apiUrl: "http://internal/jmap/",
            uploadUrl: "http://internal/jmap/upload/{accountId}/",
            primaryAccounts: {
              "urn:ietf:params:jmap:mail": "acct-1",
              "urn:ietf:params:jmap:submission": "acct-1",
            },
            accounts: { "acct-1": {} },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        methodCalls?: Array<[string, Record<string, unknown>, string]>;
      };
      const methods = (payload.methodCalls ?? []).map((entry) => entry[0]);

      if (methods.includes("Mailbox/get")) {
        return new Response(
          JSON.stringify({
            methodResponses: [
              [
                "Mailbox/get",
                {
                  list: [
                    { id: "mb-drafts", role: "drafts", name: "Drafts" },
                    { id: "mb-sent", role: "sent", name: "Sent" },
                  ],
                },
                "m",
              ],
              [
                "Identity/get",
                { list: [{ id: "ident-1", email: "noreply@solace.onl" }] },
                "i",
              ],
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (methods.includes("Email/set")) {
        return new Response(
          JSON.stringify({
            methodResponses: [
              ["Email/set", { created: { draft1: { id: "email-1" } } }, "c1"],
              [
                "EmailSubmission/set",
                { created: { s1: { id: "sub-1" } } },
                "c2",
              ],
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("unexpected", { status: 500 });
    }) as unknown as typeof fetch;

    const submissionId = await sendTransactionalEmailViaStalwart(
      {
        baseUrl: "https://mail.solace.onl",
        username: "noreply@solace.onl",
        password: "secret",
        from: "noreply@solace.onl",
        fromName: "Solace",
      },
      {
        to: "user@example.com",
        subject: "Hello",
        text: "Hi",
        html: "<p>Hi</p>",
      },
      fetcher,
    );

    expect(submissionId).toBe("sub-1");
    expect(calls[0]?.url).toBe("https://mail.solace.onl/jmap/session");
    const sendBody = calls.find((call) => call.body?.includes("Email/set"))?.body;
    expect(sendBody).toContain("Email/set");
    expect(sendBody).toContain("EmailSubmission/set");
    expect(sendBody).not.toContain("secret");
  });

  it("fails closed when the identity is missing", async () => {
    const fetcher = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/jmap/session")) {
        return new Response(
          JSON.stringify({
            apiUrl: "https://mail.solace.onl/jmap/",
            primaryAccounts: { "urn:ietf:params:jmap:mail": "acct-1" },
            accounts: { "acct-1": {} },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          methodResponses: [
            [
              "Mailbox/get",
              { list: [{ id: "mb-drafts", role: "drafts", name: "Drafts" }] },
              "m",
            ],
            ["Identity/get", { list: [] }, "i"],
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await expect(
      sendTransactionalEmailViaStalwart(
        {
          baseUrl: "https://mail.solace.onl",
          username: "noreply@solace.onl",
          password: "secret",
          from: "noreply@solace.onl",
          fromName: "Solace",
        },
        { to: "user@example.com", subject: "Hello", text: "Hi", html: "<p>Hi</p>" },
        fetcher,
      ),
    ).rejects.toThrow(/identity was not found/);
  });
});
