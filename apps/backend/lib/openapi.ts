export const apiSecuritySchemes = {
  secureSessionCookie: {
    type: "apiKey",
    in: "cookie",
    name: "__Secure-better-auth.session_token",
    description:
      "Primary Better Auth session cookie used by HTTPS and production deployments.",
  },
  sessionCookie: {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description:
      "Fallback Better Auth session cookie used in local or non-secure development environments.",
  },
} as const;

export const sessionCookieAuthSecurity: Array<Record<string, string[]>> = [
  { secureSessionCookie: [] },
  { sessionCookie: [] },
];

export const apiDocumentationTags = [
  {
    name: "Health",
    description: "Operational readiness, liveness, and connectivity checks.",
  },
  {
    name: "Auth",
    description:
      "Application-facing session inspection endpoints for checking the active user.",
  },
  {
    name: "Better Auth",
    description:
      "Generated authentication endpoints for GitHub OAuth, passkeys, one-time tokens, session lifecycle, and account management.",
  },
  {
    name: "Account",
    description:
      "Public sign-up validation and authenticated account lifecycle operations.",
  },
  {
    name: "Mail",
    description:
      "Mailbox provisioning, vault backup access, public key lookup, and JMAP proxy routes.",
  },
  {
    name: "Events",
    description:
      "Create, search, update, delete, and export calendar events across the authenticated user's calendars.",
  },
  {
    name: "Categories",
    description:
      "Personal labels and colors used to organize events in the UI and filter event lists.",
  },
  {
    name: "Calendars",
    description:
      "Calendar containers for grouping events, sharing data, and coordinating local or synced schedules.",
  },
  {
    name: "Settings",
    description:
      "User preferences for display, working hours, reminders, and default calendar behavior.",
  },
  {
    name: "Profiles",
    description:
      "Authenticated lookup of Solace user profile pictures by email for mail and calendar avatars.",
  },
  {
    name: "Notifications",
    description: "Reminder rules and delivery scheduling for upcoming events.",
  },
  {
    name: "Recurring",
    description:
      "Recurrence rule validation, previews, and recurring-series lifecycle operations.",
  },
  {
    name: "Calendar Subscriptions",
    description:
      "External ICS feed subscriptions, manual ICS imports, and background sync controls.",
  },
  {
    name: "ICS Sharing",
    description:
      "Token-based public ICS exports and authenticated share-link management for calendars.",
  },
];

export const apiDocumentationDescription = `Rocani exposes a session-based calendar API for calendars, events, subscriptions, reminders, and public ICS feeds.

## Authentication
These docs assume browser-based Better Auth sessions. In production the session cookie is typically \`__Secure-better-auth.session_token\`; in local development it falls back to \`better-auth.session_token\`. Sign in through GitHub OAuth first, then open the docs in the same browser session.

## Core model
- Calendars are the top-level containers for events.
- Events can be timed, all-day, recurring, categorized, and reminder-enabled.
- Categories are personal metadata used for organization and color-coding.
- Subscriptions mirror remote ICS feeds into sync-managed calendars.
- ICS share links publish read-only tokenized exports for external clients.

## Dates, times, and recurrence
Use ISO 8601 timestamps for date values and IANA timezone identifiers whenever timezone-sensitive operations matter. Recurring endpoints let clients preview or validate recurrence behavior before writing a full series.

## Error format
Most failures return a standard JSON envelope containing \`error\`, \`message\`, \`statusCode\`, and \`timestamp\`. Validation responses may also include structured field-level details.`;

export function authenticatedRouteDetail(tag: string) {
  return {
    detail: {
      tags: [tag],
      security: sessionCookieAuthSecurity,
    },
  };
}
