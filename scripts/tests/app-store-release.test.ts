import { describe, expect, it, mock } from "bun:test";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  AppStoreReleaseError,
  createAppleRequest,
  readReleaseInput,
  submitAppStoreBuild,
} from "../app-store-release";

const input = {
  app: "mail",
  version: "1.0.6",
  buildNumber: "42",
} as const;
const environment = {
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/master",
  DEFAULT_BRANCH: "master",
  INPUT_APP: "mail",
  INPUT_VERSION: "1.0.6",
  INPUT_BUILD_NUMBER: "42",
};

function appleFixture(
  options: {
    state?: string;
    attached?: string | null;
    releaseType?: string;
    bundleId?: string;
    builds?: boolean;
    versions?: boolean;
    processing?: string;
    expired?: boolean;
    audience?: string;
    drafts?: string[];
    items?: Record<string, (string | null)[]>;
    next?: string;
    changedItems?: boolean;
    submittedState?: string;
  } = {},
) {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const reviewItems = { ...options.items };
  const request = mock(
    async (path: string, method = "GET", body?: unknown): Promise<unknown> => {
      calls.push({ path, method, body });
      const url = new URL(path, "https://api.example.test");
      if (method !== "GET") {
        if (url.pathname === "/v1/reviewSubmissionItems") {
          for (const id of options.drafts ?? ["new-review"])
            reviewItems[id] = ["version-1"];
        }
        return {
          data: {
            id: "new-review",
            attributes: {
              state: options.submittedState ?? "WAITING_FOR_REVIEW",
            },
          },
        };
      }
      if (url.pathname === "/v1/apps/123") {
        return {
          data: {
            attributes: { bundleId: options.bundleId ?? "onl.solace.mail" },
          },
        };
      }
      if (url.pathname === "/v1/apps/123/appStoreVersions") {
        expect(url.searchParams.get("filter[platform]")).toBe("IOS");
        expect(url.searchParams.get("filter[versionString]")).toBe("1.0.6");
        return {
          data:
            options.versions === false
              ? []
              : [
                  {
                    id: "version-1",
                    attributes: {
                      versionString: "1.0.6",
                      platform: "IOS",
                      appVersionState:
                        options.state ?? "PREPARE_FOR_SUBMISSION",
                      releaseType: options.releaseType ?? "MANUAL",
                    },
                    relationships: {
                      build: {
                        data: options.attached
                          ? { id: options.attached }
                          : null,
                      },
                    },
                  },
                ],
          links: { next: options.next ?? null },
        };
      }
      if (url.pathname === "/v1/builds") {
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
          "filter[app]": "123",
          "filter[version]": "42",
          "filter[preReleaseVersion.version]": "1.0.6",
          "filter[preReleaseVersion.platform]": "IOS",
        });
        return {
          data:
            options.builds === false
              ? []
              : [
                  {
                    id: "build-1",
                    attributes: {
                      version: "42",
                      processingState: options.processing ?? "VALID",
                      expired: options.expired ?? false,
                      buildAudienceType:
                        options.audience ?? "APP_STORE_ELIGIBLE",
                    },
                  },
                ],
        };
      }
      if (url.pathname === "/v1/reviewSubmissions") {
        expect(url.searchParams.get("filter[app]")).toBe("123");
        expect(url.searchParams.get("filter[platform]")).toBe("IOS");
        expect(url.searchParams.get("filter[state]")).toBe("READY_FOR_REVIEW");
        return { data: (options.drafts ?? []).map((id) => ({ id })) };
      }
      const draftId = url.pathname.split("/")[3] ?? "";
      if (url.pathname.endsWith("/items")) {
        expect(url.searchParams.get("include")).toBe("appStoreVersion");
        expect(url.searchParams.get("fields[reviewSubmissionItems]")).toBe(
          "appStoreVersion",
        );
        const items = options.changedItems
          ? ["version-1", null]
          : (reviewItems[draftId] ?? []);
        return {
          data: items.map((id) => ({
            relationships: {
              appStoreVersion: { data: id ? { id } : null },
            },
          })),
        };
      }
      throw new Error(`Unexpected fixture request: ${method} ${url.pathname}`);
    },
  );
  return {
    request,
    calls,
    writes: () => calls.filter((call) => call.method !== "GET"),
  };
}

describe("App Store release dispatch", () => {
  it("accepts only an explicit default-branch dispatch with an exact numeric version and build", () => {
    expect(readReleaseInput(environment)).toEqual(input);
    for (const patch of [
      { GITHUB_EVENT_NAME: "push" },
      { GITHUB_REF: "refs/heads/testing" },
      { GITHUB_REF: "refs/tags/master" },
      { DEFAULT_BRANCH: "" },
      { INPUT_APP: "all" },
      { INPUT_VERSION: "latest" },
      { INPUT_BUILD_NUMBER: "42\n43" },
      { INPUT_BUILD_NUMBER: "latest" },
    ]) {
      expect(() => readReleaseInput({ ...environment, ...patch })).toThrow(
        AppStoreReleaseError,
      );
    }
  });

  it("submits the selected build with automatic release and preserves listing fields", async () => {
    const fixture = appleFixture();
    expect(await submitAppStoreBuild(input, "123", fixture.request)).toContain(
      "submitted for App Review",
    );
    expect(fixture.writes()).toEqual([
      {
        path: "/v1/appStoreVersions/version-1",
        method: "PATCH",
        body: {
          data: {
            type: "appStoreVersions",
            id: "version-1",
            attributes: {
              releaseType: "AFTER_APPROVAL",
              earliestReleaseDate: null,
            },
            relationships: {
              build: { data: { type: "builds", id: "build-1" } },
            },
          },
        },
      },
      {
        path: "/v1/reviewSubmissions",
        method: "POST",
        body: {
          data: {
            type: "reviewSubmissions",
            attributes: { platform: "IOS" },
            relationships: { app: { data: { type: "apps", id: "123" } } },
          },
        },
      },
      {
        path: "/v1/reviewSubmissionItems",
        method: "POST",
        body: {
          data: {
            type: "reviewSubmissionItems",
            relationships: {
              reviewSubmission: {
                data: { type: "reviewSubmissions", id: "new-review" },
              },
              appStoreVersion: {
                data: { type: "appStoreVersions", id: "version-1" },
              },
            },
          },
        },
      },
      {
        path: "/v1/reviewSubmissions/new-review",
        method: "PATCH",
        body: {
          data: {
            type: "reviewSubmissions",
            id: "new-review",
            attributes: { submitted: true },
          },
        },
      },
    ]);
  });

  it("supports Calendar with its own bundle identity", async () => {
    const fixture = appleFixture({ bundleId: "onl.solace.calendar" });
    expect(
      await submitAppStoreBuild(
        { ...input, app: "calendar" },
        "123",
        fixture.request,
      ),
    ).toContain("Solace Calendar");
  });

  it.each([
    { bundleId: "onl.solace.calendar" },
    { builds: false },
    { versions: false },
    { processing: "PROCESSING" },
    { expired: true },
    { audience: "INTERNAL_ONLY" },
    { state: "IN_REVIEW", attached: "other-build" },
    { state: "PENDING_DEVELOPER_RELEASE" },
    { state: "REJECTED" },
    { next: "https://api.example.test/next" },
  ])(
    "refuses unsafe or incomplete submissions before any mutation: %j",
    async (options) => {
      const fixture = appleFixture(options);
      await expect(
        submitAppStoreBuild(input, "123", fixture.request),
      ).rejects.toBeInstanceOf(AppStoreReleaseError);
      expect(fixture.writes()).toEqual([]);
    },
  );

  it("reuses a draft containing only this version after an interrupted submission", async () => {
    const fixture = appleFixture({
      drafts: ["existing-review"],
      items: { "existing-review": ["version-1"] },
    });
    await submitAppStoreBuild(input, "123", fixture.request);
    expect(
      fixture.writes().map(({ method, path }) => `${method} ${path}`),
    ).toEqual([
      "PATCH /v1/appStoreVersions/version-1",
      "PATCH /v1/reviewSubmissions/existing-review",
    ]);
  });

  it("reuses an empty draft after an interrupted creation", async () => {
    const fixture = appleFixture({ drafts: ["empty-review"] });
    await submitAppStoreBuild(input, "123", fixture.request);
    expect(
      fixture.writes().map(({ method, path }) => `${method} ${path}`),
    ).toEqual([
      "PATCH /v1/appStoreVersions/version-1",
      "POST /v1/reviewSubmissionItems",
      "PATCH /v1/reviewSubmissions/empty-review",
    ]);
  });

  it("never submits other items in the same review group", async () => {
    const fixture = appleFixture({
      drafts: ["mixed-review"],
      items: { "mixed-review": ["version-1", null] },
    });
    await expect(
      submitAppStoreBuild(input, "123", fixture.request),
    ).rejects.toThrow("other items");
    expect(fixture.writes()).toEqual([]);
  });

  it.each([
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "READY_FOR_DISTRIBUTION",
    "PROCESSING_FOR_DISTRIBUTION",
  ])("does not submit again in %s", async (state) => {
    const fixture = appleFixture({
      state,
      attached: "build-1",
      releaseType: "AFTER_APPROVAL",
    });
    expect(await submitAppStoreBuild(input, "123", fixture.request)).toContain(
      "already",
    );
    expect(fixture.writes()).toEqual([]);
  });

  it.each([
    { state: "PENDING_DEVELOPER_RELEASE", attached: "other-build" },
    { state: "IN_REVIEW", attached: "build-1" },
    { state: "READY_FOR_DISTRIBUTION", attached: "other-build" },
  ])(
    "refuses a different build or a review still configured for manual release: %j",
    async (options) => {
      const fixture = appleFixture(options);
      await expect(
        submitAppStoreBuild(input, "123", fixture.request),
      ).rejects.toBeInstanceOf(AppStoreReleaseError);
      expect(fixture.writes()).toEqual([]);
    },
  );

  it("stops before submission when Apple rejects the selected build", async () => {
    const fixture = appleFixture();
    const request = mock(
      async (
        path: string,
        method?: "GET" | "POST" | "PATCH",
        body?: unknown,
      ) => {
        if (method === "PATCH")
          throw new AppStoreReleaseError("Apple rejected the build");
        return fixture.request(path, method, body);
      },
    );
    await expect(submitAppStoreBuild(input, "123", request)).rejects.toThrow(
      "Apple rejected",
    );
    expect(fixture.writes()).toEqual([]);
  });

  it("rechecks the review items before submitting them", async () => {
    const fixture = appleFixture({ changedItems: true });
    await expect(
      submitAppStoreBuild(input, "123", fixture.request),
    ).rejects.toThrow("review submission changed");
    expect(
      fixture
        .writes()
        .some((call) => call.path === "/v1/reviewSubmissions/new-review"),
    ).toBe(false);
  });

  it("does not report success until Apple confirms review submission", async () => {
    const fixture = appleFixture({ submittedState: "READY_FOR_REVIEW" });
    await expect(
      submitAppStoreBuild(input, "123", fixture.request),
    ).rejects.toThrow("has not confirmed");
  });
});

describe("App Store Connect authentication", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const credentials = {
    ASC_KEY_ID: "ABCDEFGHIJ",
    ASC_ISSUER_ID: "12345678-1234-4234-8234-123456789012",
    ASC_PRIVATE_KEY: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };

  it("signs a short-lived ES256 JWT and keeps credentials on Apple's origin", async () => {
    const transport = mock(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.appstoreconnect.apple.com/v1/apps/123");
      expect(init.redirect).toBe("error");
      const headers = new Headers(init.headers);
      const token = headers.get("Authorization")?.replace("Bearer ", "") ?? "";
      const [header = "", payload = "", signature = ""] = token.split(".");
      expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
        alg: "ES256",
        kid: credentials.ASC_KEY_ID,
        typ: "JWT",
      });
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      expect(claims).toMatchObject({
        iss: credentials.ASC_ISSUER_ID,
        aud: "appstoreconnect-v1",
      });
      expect(claims.exp - claims.iat).toBe(300);
      expect(
        verify(
          "sha256",
          Buffer.from(`${header}.${payload}`),
          { key: publicKey, dsaEncoding: "ieee-p1363" },
          Buffer.from(signature, "base64url"),
        ),
      ).toBe(true);
      return Response.json({ data: {} });
    });
    const request = createAppleRequest(credentials, transport);
    await request("/v1/apps/123");
    await expect(request("https://example.test/steal")).rejects.toThrow(
      "Invalid Apple API path",
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("keeps upstream bodies and network errors out of logs", async () => {
    const rejected = createAppleRequest(
      credentials,
      async () => new Response("private review details", { status: 422 }),
    );
    await expect(rejected("/v1/apps/123")).rejects.toThrow("HTTP 422");
    await rejected("/v1/apps/123").catch((error: unknown) => {
      expect(String(error)).not.toContain("private review details");
    });
    const failed = createAppleRequest(credentials, async () => {
      throw new Error("secret network details");
    });
    await expect(failed("/v1/apps/123")).rejects.toThrow("failed or timed out");
  });

  it("rejects missing credentials and invalid signing keys locally", () => {
    expect(() => createAppleRequest({})).toThrow("Configure ASC_KEY_ID");
    expect(() =>
      createAppleRequest({ ...credentials, ASC_PRIVATE_KEY: "invalid" }),
    ).toThrow("complete Apple .p8");
    const wrongKey = generateKeyPairSync("ec", { namedCurve: "secp384r1" })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    expect(() =>
      createAppleRequest({ ...credentials, ASC_PRIVATE_KEY: wrongKey }),
    ).toThrow("P-256");
  });
});
