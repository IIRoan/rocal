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

export function renderApiDocsDeniedHtml(options: {
  title: string;
  message: string;
  loginUrl: string;
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${options.title}</title>
    <style>
      :root {
        color-scheme: light;
        --page: #f6f2eb;
        --card: rgba(255, 255, 255, 0.88);
        --ink: #1f2933;
        --muted: #5d6b78;
        --accent: #0f766e;
        --accent-strong: #115e59;
        --border: rgba(15, 23, 42, 0.12);
        --shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 32%),
          radial-gradient(circle at bottom right, rgba(180, 83, 9, 0.12), transparent 26%),
          var(--page);
        color: var(--ink);
        font-family: "Segoe UI", Arial, sans-serif;
      }

      main {
        width: min(720px, 100%);
        border: 1px solid var(--border);
        border-radius: 24px;
        background: var(--card);
        box-shadow: var(--shadow);
        backdrop-filter: blur(12px);
        overflow: hidden;
      }

      .hero {
        padding: 32px 32px 12px;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.12);
        color: var(--accent-strong);
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 16px 0 12px;
        font-size: clamp(30px, 6vw, 42px);
        line-height: 1.05;
      }

      p {
        margin: 0;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.7;
      }

      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        padding: 20px 32px 32px;
      }

      .panel {
        border: 1px solid var(--border);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.84);
        padding: 18px;
      }

      .panel h2 {
        margin: 0 0 8px;
        font-size: 15px;
      }

      .panel p,
      .panel li {
        font-size: 14px;
      }

      ul {
        margin: 10px 0 0;
        padding-left: 18px;
        color: var(--muted);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        padding: 0 32px 32px;
      }

      a.button,
      button {
        appearance: none;
        border: none;
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        text-decoration: none;
        cursor: pointer;
      }

      a.button.primary {
        background: var(--accent);
        color: #ffffff;
        font-weight: 700;
      }

      button {
        background: rgba(15, 23, 42, 0.06);
        color: var(--ink);
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="badge">Internal API docs</div>
        <h1>${options.title}</h1>
        <p>${options.message}</p>
      </section>

      <section class="grid">
        <article class="panel">
          <h2>Who can open these docs</h2>
          <p>Only the whitelisted GitHub identity can access this reference.</p>
          <ul>
            <li>Approved email: ${API_DOCS_ALLOWED_EMAIL}</li>
            <li>Authentication method: GitHub OAuth</li>
            <li>Browser session: Better Auth cookie session</li>
          </ul>
        </article>

        <article class="panel">
          <h2>What to do next</h2>
          <p>Open the sign-in flow, authenticate with the approved GitHub account, then return to this tab and refresh.</p>
          <ul>
            <li>If you are signed in with the wrong account, sign out first.</li>
            <li>Keep the docs and login flow in the same browser profile.</li>
          </ul>
        </article>
      </section>

      <section class="actions">
        <a class="button primary" href="${options.loginUrl}">Open sign-in</a>
        <button type="button" onclick="window.location.reload()">Reload this page</button>
      </section>
    </main>
  </body>
</html>`;
}

export function createApiDocsErrorBody(result: ApiDocsDeniedResult) {
  return {
    error: result.status === 401 ? "Unauthorized" : "Forbidden",
    message: result.message,
    statusCode: result.status,
    timestamp: new Date().toISOString(),
  };
}
