import { auth } from "./auth";
import { prisma } from "./prisma";

export const API_DOCS_ALLOWED_EMAIL =
  "github.com.q6c0y@lunary.roan.zip".toLowerCase();
export const API_DOCS_UI_PATH = "/docs";
export const API_DOCS_SPEC_PATH = "/docs/json";

type ApiDocsDeniedResult = {
  allowed: false;
  status: 401 | 403;
  title: string;
  message: string;
};

type ApiDocsAllowedResult = {
  allowed: true;
};

export type ApiDocsAccessResult = ApiDocsAllowedResult | ApiDocsDeniedResult;

const AUTH_REQUIRED_RESULT: ApiDocsDeniedResult = {
  allowed: false,
  status: 401,
  title: "Authentication required",
  message:
    "Sign in with GitHub OAuth using the approved account, then reload the API docs in the same browser session.",
};

export async function getApiDocsAccess(
  request: Request,
): Promise<ApiDocsAccessResult> {
  try {
    const session = await auth.api.getSession({
      headers: request.headers as Headers,
    });

    if (!session?.user) {
      return AUTH_REQUIRED_RESULT;
    }

    if (session.user.email?.toLowerCase() !== API_DOCS_ALLOWED_EMAIL) {
      return {
        allowed: false,
        status: 403,
        title: "Access restricted",
        message: `These docs are limited to the GitHub account ${API_DOCS_ALLOWED_EMAIL}.`,
      };
    }

    const githubAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        providerId: "github",
      },
      select: {
        id: true,
      },
    });

    if (!githubAccount) {
      return {
        allowed: false,
        status: 403,
        title: "GitHub OAuth required",
        message:
          "The approved user must have an attached GitHub OAuth account before the docs can be opened.",
      };
    }

    return { allowed: true };
  } catch {
    return AUTH_REQUIRED_RESULT;
  }
}

export function createApiDocsErrorBody(result: ApiDocsDeniedResult) {
  return {
    error: result.status === 401 ? "Unauthorized" : "Forbidden",
    message: result.message,
    statusCode: result.status,
    timestamp: new Date().toISOString(),
  };
}
