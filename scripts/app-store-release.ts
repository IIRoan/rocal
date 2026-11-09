import { createPrivateKey, sign } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "@workspace/calendar-core/zod";
import identities from "../packages/native-core/expo-apps.json";

export class AppStoreReleaseError extends Error {}

const releaseInputSchema = z.strictObject({
  app: z.enum(["calendar", "mail"]),
  version: z.string().regex(/^\d+\.\d+(?:\.\d+)?$/),
  buildNumber: z.string().regex(/^\d+(?:\.\d+){0,2}$/),
});
type ReleaseInput = z.infer<typeof releaseInputSchema>;
type AppleRequest = (
  path: string,
  method?: "GET" | "POST" | "PATCH",
  body?: unknown,
) => Promise<unknown>;

const idSchema = z.string().regex(/^[A-Za-z0-9-]+$/);
const linkageSchema = z.object({ id: idSchema });
const versionStateSchema = z.enum([
  "ACCEPTED",
  "DEVELOPER_REJECTED",
  "IN_REVIEW",
  "INVALID_BINARY",
  "METADATA_REJECTED",
  "PENDING_APPLE_RELEASE",
  "PENDING_DEVELOPER_RELEASE",
  "PREPARE_FOR_SUBMISSION",
  "PROCESSING_FOR_DISTRIBUTION",
  "READY_FOR_DISTRIBUTION",
  "READY_FOR_REVIEW",
  "REJECTED",
  "REPLACED_WITH_NEW_VERSION",
  "WAITING_FOR_EXPORT_COMPLIANCE",
  "WAITING_FOR_REVIEW",
]);
const versionSchema = z.object({
  id: idSchema,
  attributes: z.object({
    versionString: z.string(),
    platform: z.literal("IOS"),
    appVersionState: versionStateSchema,
    releaseType: z.string(),
  }),
  relationships: z.object({
    build: z.object({ data: linkageSchema.nullable() }),
  }),
});
const buildSchema = z.object({
  id: idSchema,
  attributes: z.object({
    version: z.string(),
    processingState: z.string(),
    expired: z.boolean(),
    buildAudienceType: z.enum(["INTERNAL_ONLY", "APP_STORE_ELIGIBLE"]),
  }),
});
const itemSchema = z.object({
  relationships: z
    .object({
      appStoreVersion: z.object({ data: linkageSchema.nullable() }).optional(),
    })
    .default({}),
});

function parseApple<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppStoreReleaseError(
      "Apple returned an unexpected response; check App Store Connect.",
    );
  return result.data;
}

async function listApple<T>(
  request: AppleRequest,
  path: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const response = parseApple(
    z.object({
      data: z.array(schema),
      links: z.object({ next: z.string().nullable().optional() }).optional(),
    }),
    await request(path),
  );
  if (response.links?.next)
    throw new AppStoreReleaseError(
      "Apple returned more results than expected; resolve the extra entries in App Store Connect.",
    );
  return response.data;
}

function query(path: string, parameters: Record<string, string>): string {
  return `${path}?${new URLSearchParams(parameters)}`;
}

function relationship(type: string, id: string) {
  return { data: { type, id } };
}

function reviewItemsPath(submissionId: string) {
  return query(`/v1/reviewSubmissions/${submissionId}/items`, {
    include: "appStoreVersion",
    "fields[reviewSubmissionItems]": "appStoreVersion",
    "fields[appStoreVersions]": "versionString",
    limit: "200",
  });
}

export function readReleaseInput(environment: NodeJS.ProcessEnv): ReleaseInput {
  if (
    environment.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    !environment.DEFAULT_BRANCH ||
    environment.GITHUB_REF !== `refs/heads/${environment.DEFAULT_BRANCH}`
  ) {
    throw new AppStoreReleaseError(
      "App Store releases require a manual dispatch from the default branch.",
    );
  }
  const result = releaseInputSchema.safeParse({
    app: environment.INPUT_APP,
    version: environment.INPUT_VERSION,
    buildNumber: environment.INPUT_BUILD_NUMBER,
  });
  if (!result.success)
    throw new AppStoreReleaseError(
      "Choose an app and an exact numeric version and build number.",
    );
  return result.data;
}

export function createAppleRequest(
  environment: NodeJS.ProcessEnv,
  transport: (url: string, init: RequestInit) => Promise<Response> = fetch,
): AppleRequest {
  const credentials = z
    .strictObject({
      keyId: z.string().regex(/^[A-Z0-9]{10}$/),
      issuerId: z.uuid(),
      privateKey: z.string().min(1),
    })
    .safeParse({
      keyId: environment.ASC_KEY_ID,
      issuerId: environment.ASC_ISSUER_ID,
      privateKey: environment.ASC_PRIVATE_KEY,
    });
  if (!credentials.success)
    throw new AppStoreReleaseError(
      "Configure ASC_KEY_ID, ASC_ISSUER_ID and ASC_PRIVATE_KEY GitHub secrets with an App Store Connect team API key.",
    );
  const { keyId, issuerId, privateKey } = credentials.data;
  const key = (() => {
    try {
      return createPrivateKey(privateKey);
    } catch {
      throw new AppStoreReleaseError(
        "ASC_PRIVATE_KEY must contain the complete Apple .p8 private key.",
      );
    }
  })();
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new AppStoreReleaseError(
      "ASC_PRIVATE_KEY must be Apple's P-256 signing key.",
    );
  }
  return async (path, method = "GET", body) => {
    if (!path.startsWith("/v1/"))
      throw new AppStoreReleaseError("Invalid Apple API path.");
    const issuedAt = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const message = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode({ iss: issuerId, iat: issuedAt, exp: issuedAt + 300, aud: "appstoreconnect-v1" })}`;
    const signature = sign("sha256", Buffer.from(message), {
      key,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
    const response = await transport(
      `https://api.appstoreconnect.apple.com${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${message}.${signature}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      },
    ).catch(() => {
      throw new AppStoreReleaseError(
        "Apple API request failed or timed out; check App Store Connect before retrying.",
      );
    });
    if (!response.ok) {
      throw new AppStoreReleaseError(
        `Apple API returned HTTP ${response.status}; check the API key permissions and the version's validation errors in App Store Connect.`,
      );
    }
    return response.json().catch(() => {
      throw new AppStoreReleaseError(
        "Apple returned an unreadable response; check App Store Connect before retrying.",
      );
    });
  };
}

async function findReviewDraft(
  request: AppleRequest,
  appId: string,
  versionId: string,
) {
  const drafts = await listApple(
    request,
    query("/v1/reviewSubmissions", {
      "filter[app]": appId,
      "filter[platform]": "IOS",
      "filter[state]": "READY_FOR_REVIEW",
      limit: "200",
    }),
    linkageSchema,
  );
  let emptyDraft: string | undefined;
  for (const draft of drafts) {
    const items = await listApple(
      request,
      reviewItemsPath(draft.id),
      itemSchema,
    );
    if (
      items.some(
        (item) => item.relationships.appStoreVersion?.data?.id === versionId,
      )
    ) {
      if (items.length !== 1)
        throw new AppStoreReleaseError(
          "This version shares a review submission with other items; submit that group in App Store Connect.",
        );
      return { id: draft.id, attached: true };
    }
    if (items.length === 0) emptyDraft = draft.id;
  }
  return { id: emptyDraft, attached: false };
}

export async function submitAppStoreBuild(
  input: ReleaseInput,
  appId: string,
  request: AppleRequest,
): Promise<string> {
  const app = parseApple(
    z.object({
      data: z.object({ attributes: z.object({ bundleId: z.string() }) }),
    }),
    await request(`/v1/apps/${appId}?fields[apps]=bundleId`),
  );
  if (
    app.data.attributes.bundleId !== identities.apps[input.app].bundleIdentifier
  ) {
    throw new AppStoreReleaseError(
      "The App Store Connect app does not match the selected Solace app.",
    );
  }
  const versions = await listApple(
    request,
    query(`/v1/apps/${appId}/appStoreVersions`, {
      "filter[platform]": "IOS",
      "filter[versionString]": input.version,
      "fields[appStoreVersions]":
        "versionString,platform,appVersionState,releaseType,build",
      include: "build",
      limit: "2",
    }),
    versionSchema,
  );
  const version = versions[0];
  if (
    versions.length !== 1 ||
    !version ||
    version.attributes.versionString !== input.version
  ) {
    throw new AppStoreReleaseError(
      "Prepare this exact iOS version and complete its listing in App Store Connect before running the workflow.",
    );
  }
  const builds = await listApple(
    request,
    query("/v1/builds", {
      "filter[app]": appId,
      "filter[version]": input.buildNumber,
      "filter[preReleaseVersion.version]": input.version,
      "filter[preReleaseVersion.platform]": "IOS",
      "fields[builds]": "version,processingState,expired,buildAudienceType",
      limit: "2",
    }),
    buildSchema,
  );
  const build = builds[0];
  if (
    builds.length !== 1 ||
    !build ||
    build.attributes.version !== input.buildNumber
  ) {
    throw new AppStoreReleaseError(
      "The exact uploaded iOS version/build was not found for this app.",
    );
  }
  const state = version.attributes.appVersionState;
  const attached = version.relationships.build.data?.id === build.id;
  const label = `${identities.apps[input.app].name} ${input.version} (${input.buildNumber})`;
  if (
    ["READY_FOR_DISTRIBUTION", "PROCESSING_FOR_DISTRIBUTION"].includes(state)
  ) {
    if (!attached)
      throw new AppStoreReleaseError(
        "The distributed version uses a different build number.",
      );
    return `${label}: already ${state}; no release request needed.`;
  }
  if (
    ["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(state) &&
    attached &&
    version.attributes.releaseType === "AFTER_APPROVAL"
  ) {
    return `${label}: already ${state}, with automatic release after approval.`;
  }
  if (
    ![
      "PREPARE_FOR_SUBMISSION",
      "READY_FOR_REVIEW",
      "DEVELOPER_REJECTED",
    ].includes(state)
  ) {
    throw new AppStoreReleaseError(
      `Cannot submit this version in state ${state}; resolve it in App Store Connect before retrying.`,
    );
  }
  if (
    build.attributes.processingState !== "VALID" ||
    build.attributes.expired ||
    build.attributes.buildAudienceType !== "APP_STORE_ELIGIBLE"
  ) {
    throw new AppStoreReleaseError(
      "Submission requires a processed, unexpired, App Store eligible build.",
    );
  }
  const draft = await findReviewDraft(request, appId, version.id);
  await request(`/v1/appStoreVersions/${version.id}`, "PATCH", {
    data: {
      type: "appStoreVersions",
      id: version.id,
      attributes: { releaseType: "AFTER_APPROVAL", earliestReleaseDate: null },
      relationships: { build: relationship("builds", build.id) },
    },
  });
  const submissionId =
    draft.id ??
    parseApple(
      z.object({ data: linkageSchema }),
      await request("/v1/reviewSubmissions", "POST", {
        data: {
          type: "reviewSubmissions",
          attributes: { platform: "IOS" },
          relationships: { app: relationship("apps", appId) },
        },
      }),
    ).data.id;
  if (!draft.attached) {
    await request("/v1/reviewSubmissionItems", "POST", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: relationship("reviewSubmissions", submissionId),
          appStoreVersion: relationship("appStoreVersions", version.id),
        },
      },
    });
  }
  const items = await listApple(
    request,
    reviewItemsPath(submissionId),
    itemSchema,
  );
  if (
    items.length !== 1 ||
    items[0]?.relationships.appStoreVersion?.data?.id !== version.id
  ) {
    throw new AppStoreReleaseError(
      "The review submission changed; inspect its items in App Store Connect before retrying.",
    );
  }
  const submitted = parseApple(
    z.object({
      data: z.object({ attributes: z.object({ state: z.string() }) }),
    }),
    await request(`/v1/reviewSubmissions/${submissionId}`, "PATCH", {
      data: {
        type: "reviewSubmissions",
        id: submissionId,
        attributes: { submitted: true },
      },
    }),
  );
  if (
    !["WAITING_FOR_REVIEW", "IN_REVIEW", "COMPLETING", "COMPLETE"].includes(
      submitted.data.attributes.state,
    )
  ) {
    throw new AppStoreReleaseError(
      "Apple has not confirmed the review submission; check App Store Connect before retrying.",
    );
  }
  return `${label}: submitted for App Review; Apple will release it automatically after approval.`;
}

async function main() {
  const input = readReleaseInput(process.env);
  const eas: unknown = JSON.parse(
    readFileSync(
      resolve(import.meta.dir, `../apps/native-${input.app}/eas.json`),
      "utf8",
    ),
  );
  const config = z
    .object({
      submit: z.object({
        production: z.object({
          ios: z.object({ ascAppId: z.string().regex(/^\d+$/) }),
        }),
      }),
    })
    .safeParse(eas);
  if (!config.success)
    throw new AppStoreReleaseError(
      "Configure submit.production.ios.ascAppId for the selected app.",
    );
  const result = await submitAppStoreBuild(
    input,
    config.data.submit.production.ios.ascAppId,
    createAppleRequest(process.env),
  );
  console.log(result);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result}\n`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof AppStoreReleaseError
        ? error.message
        : "App Store release failed; check the configuration and App Store Connect before retrying.",
    );
    process.exitCode = 1;
  });
}
