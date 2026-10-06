# Repo rules

Offline, deterministic checks for the rules in `AGENTS.md`. `bun run check:rules` (part of `bun run lint` and CI) runs them over every tracked and new, non-ignored file.

```sh
bun run check:rules                         # whole repo
bun run check:rules --counts                # violations per rule
bun run check:rules --rule=theme-tokens-only apps/web/components/foo.tsx
```

## Exceptions

When a finding is a reviewed, legitimate exception, put this on the reported line or the line above:

```ts
// repo-rules-allow <rule-id>: <why this is safe>
```

In JSX use `{/* repo-rules-allow <rule-id>: <why> */}`, in CSS `/* repo-rules-allow <rule-id>: <why> */`. The reason is required. Never use it to silence a real violation; fix the code instead. For `type-escape-hatches`, any comment on the same or previous line that explains the guarantee is enough (AGENTS.md §5).

## Adding a rule

Add it to the matching module (`repository`, `comments`, `backend`, `client`, `typescript`, `react`, `ui`), give it `examples.bad` and `examples.good` (the runner self-tests them before every scan and fails if a bad example passes or a good one is reported), add a row below, and fix or allow-comment every existing violation in the same change.

## Rules

| Rule | Checks |
| --- | --- |
| `forbidden-dependencies` | Workspace manifests must not depend on banned mail, analytics, state, validation, HTTP, date, motion, or CSS-in-JS libraries. |
| `no-pii-tracking-config` | Error reporting never sends default PII, never enables IP tracking, and the query cache is never persisted. |
| `no-committed-secrets` | Only `.env*.example` files (and the public web production env) and no private keys may be committed. |
| `no-alternate-mail-transport` | Mail runs over JMAP only: no SMTP/IMAP/POP3 URLs or Resend, and the provisioning token stays in the admin client. |
| `comments-one-line` | Every comment, including JSDoc, is a single line. |
| `no-commented-out-code` | Delete dead code instead of commenting it out. |
| `todos-need-owner` | TODO, FIXME, HACK, and XXX comments name an owner `TODO(name)` or reference an issue. |
| `thin-routes` | Backend routes may hand the Prisma client to a service constructor but never query it, and never import zod. |
| `owner-scoped-data` | Service Prisma queries without an owner filter must sit in a function with owner/session context, or be allow-commented. |
| `safe-user-url-fetch` | Backend outbound requests go through `safeFetch`; raw `fetch` only for fixed trusted endpoints, allow-commented. |
| `client-api-boundary` | App code reaches Solace APIs through `@workspace/calendar-client`; raw `fetch`/`XMLHttpRequest` needs an allow comment naming the protocol. |
| `e2ee-client-content` | Payloads never carry plaintext title/description/location/name next to ciphertext. |
| `client-safe-logging` | Web and native code log only static strings to the console. |
| `secure-email-html` | Raw HTML is only inserted by reviewed sanitizing renderers, and frames never allow scripts. |
| `query-key-factory` | Query keys come from a `*query-keys.ts` factory, never inline arrays. |
| `query-domain-hooks` | `useQuery`/`useMutation` live in named `use*` domain hooks. |
| `no-blanket-invalidate` | Invalidate the precise key; never invalidate or refetch every query. |
| `timezone-safe-calendar-code` | Event times use calendar-core zoned helpers, never local `Date` setters or date-fns local-day/format helpers. |
| `type-escape-hatches` | `any`, `as unknown as`, and non-null `!` need an explaining comment; `@ts-ignore`/`@ts-nocheck` are banned. |
| `typescript-untrusted-input` | `JSON.parse` and `response.json()` results are validated, not cast to a domain type. |
| `typescript-null-safety` | `Array.find` results are checked or optional-chained before they are dereferenced. |
| `async-promise-handling` | `void promise` does not handle rejection; attach `.catch` or await it. |
| `react-effect-lifecycle` | Effects that install listeners, intervals, subscriptions, or observers return a cleanup. |
| `react-effect-purpose` | An effect that only calls state setters is derived state; compute it in render or the handler. |
| `react-component-boundaries` | Components are defined at module scope, never inside another component. |
| `react-immutable-state` | Never mutate React state or query data in place. |
| `wcag-accessible-names` | WCAG 1.1.1/4.1.2: images have alt text; icon-only buttons and links have an accessible name. |
| `wcag-keyboard-access` | WCAG 2.1.1/2.4.3: clickable non-interactive elements need a role and key handler; no positive `tabIndex`. |
| `wcag-visible-focus` | WCAG 2.4.7: `outline-none` requires a `focus-visible:` style on the same element. |
| `wcag-allow-zoom` | WCAG 1.4.4: never disable pinch zoom or cap the viewport scale. |
| `theme-tokens-only` | Colors come from theme tokens: no hex/rgb/hsl literals, raw palette or white/black classes, gradients, or backdrop blur outside palette and email-template files. |
| `motion-compositor-only` | Motion animates only transform/opacity: no `transition-all`, layout transitions or keyframes; `dvh` not `100vh`; no press-scale. |
| `motion-shared-helpers` | WAAPI via `@workspace/ui/lib/motion`, GSAP via `@workspace/ui/lib/gsap`, no `motion/react`, no `LayoutAnimation`, native driver for core `Animated`. |
| `motion-reduced-motion` | Stylesheets that declare animations honor `prefers-reduced-motion`. |
