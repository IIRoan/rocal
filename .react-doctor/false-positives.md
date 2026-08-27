# React Doctor false positives

Patterns that fire diagnostics but are safe to suppress.

## react-doctor/rn-no-raw-text

- **Files**: `apps/native/src/providers/E2eeProvider.test.tsx`,
  `packages/mobile-ui/src/MobilePage.test.tsx`
- **Why FP**: Test files use a JSDOM/jest environment with `react-test-renderer`
  rather than mounting on a real React Native host. Raw strings inside JSX in
  tests do not crash because no native `<Text>` component is rendered.

## react-doctor/rn-no-scroll-state

- **File**: `apps/native/src/components/event/EventSheet.tsx:580`
- **Why FP**: The `setState` call inside `onScroll` is gated by a ref-based
  edge-detector (`viewScrollAtTopRef.current !== nextAtTop`), so it fires at
  most twice per scroll session (entering / leaving the top region) — not on
  every scroll event.

## react-doctor/only-export-components — shadcn convention

- **Files**: `packages/ui/src/components/ui/badge.tsx`
- **Why FP**: shadcn/ui's component template colocates `xxxVariants` (a
  cva-built helper) with the component itself. Splitting these defeats the
  reason callers import from a single file and is an upstream convention we
  intentionally follow.
- **Note**: `button.tsx` was split (`button-variants.ts`) so Fast Refresh
  stays valid (2026-08-25).

## react-doctor/only-export-components — encryption-status companion re-exports

- **File**: `packages/ui/src/components/calendar/encryption-status.tsx:12–17`
- **Why FP**: The file re-exports utility types and helpers from its companion
  module `./encryption-status-utils` so callers have a single import surface.
  This is the canonical colocation pattern for a component and its associated
  utilities.

## react-doctor/nextjs-no-use-search-params-without-suspense — _content.tsx

- **File**: `apps/web/app/reset-password/_content.tsx:23`
- **Why FP**: The component always renders inside `<Suspense>` — enforced by
  `page.tsx` which wraps `<ResetPasswordContent />` in a Suspense boundary.
  The static rule cannot see the parent's Suspense boundary.

## react-doctor/react-compiler-destructure-method — useSearchParams().get()

- **File**: `apps/web/app/reset-password/_content.tsx:24,25`
- **Why FP**: `useSearchParams()` returns a `ReadonlyURLSearchParams` object
  where `.get()` is a method requiring `this` context. Destructuring
  `const { get } = useSearchParams()` would produce an unbound function that
  throws at runtime. The correct pattern is `searchParams.get("key")`.

## react-doctor/exhaustive-deps — mailCalendarInvite in message-reader.tsx

- **File**: `apps/web/components/mail/message-reader.tsx:949`
- **Why FP**: The effect intentionally uses `mailCalendarInvite?.icsContent`
  and `mailCalendarInvite?.method` as deps (not the full object) to avoid
  re-running on reference changes when the invite content hasn't changed.
  The eslint-disable-next-line comment documents this.

## react-doctor/nextjs-no-img-element — email attachment preview

- **File**: `apps/web/components/mail/message-reader.tsx:2015`
- **Why FP**: The image preview renders an attachment served as a blob/data URL
  generated client-side. `next/image` requires a configured domain allowlist
  and cannot optimize blob/data URLs. The eslint-disable comment is intentional.

## react-doctor/js-tosorted-immutable — native tsconfig ES2022

- **Files**: `apps/native/app/calendar-manage/index.tsx:76`,
  `apps/native/app/settings/index.tsx` (timezone/calendar sort),
  `apps/native/app/(tabs)/settings/index.tsx:197` (legacy path)
- **Why FP**: `Array.prototype.toSorted` is ES2023. The native app tsconfig
  uses `lib: ["DOM", "ES2022"]` and `target: ES2022`. The existing
  `[...arr].sort(compareFn)` pattern is already immutable (spread creates a
  new array). Upgrading to ES2023 lib is deferred.

## react-doctor/js-hoist-intl — NotificationCalculator timezone cache

- **File**: `apps/backend/lib/notification-calculator.ts`
- **Why FP**: `Intl.DateTimeFormat` options include a per-call IANA timezone.
  Formatters are cached in a module-level `Map` keyed by resolved timezone
  (`getLocalDateTimeFormatter`). Hoisting a single formatter to module scope
  would drop timezone correctness.
- **Config**: Suppressed via `react-doctor.config.json` → `ignore.overrides`
  for `**/lib/notification-calculator.ts`.

## react-doctor/async-await-in-loop — intentional sequential side effects

- **Files**:
  - `apps/backend/services/event.service.ts` (event duplicate fan-out)
  - `apps/backend/services/event-participant.service.ts` (invitation email delivery)
  - `apps/backend/services/mail-sync.service.ts` (per-account JMAP receipt poll)
- **Why FP**: Each iteration performs ordered side effects (create → sync
  participants → send invites; outbound mail delivery; JMAP change detection
  per mailbox). Parallelizing would race DB uniqueness, amplify rate limits,
  or send invitations before dependent rows exist. Keep sequential `for…of`.

## react-doctor/no-giant-component — LoginForm auth surface

- **File**: `apps/web/app/login/_content.tsx` (`LoginFormBody`)
- **Why FP**: `LoginFormBody` is a single auth flow (sign-in, sign-up,
  forgot-password, passkey step-up) with shared overlay, validation debouncing,
  and redirect logic. Splitting would fragment tightly coupled state transitions
  without improving testability — tests target the exported `LoginForm` wrapper.
- **Config**: Suppressed via `react-doctor.config.json` →
  `ignore.overrides` for `**/app/login/_content.tsx`.

## react-doctor/async-await-in-loop — e2ee password setup retries (resolved)

- **File**: `apps/web/components/e2ee-bootstrap.tsx`
- **Note**: Retry loop refactored to recursive `attemptEncryptionPasswordSetup`
  (2026-07-15). Attempts remain sequential by design.

## react-doctor/no-cascading-set-state — E2eeBootstrap sign-out reset (resolved)

- **File**: `apps/web/components/e2ee-bootstrap.tsx`
- **Note**: Gate fields consolidated into `e2eeGateReducer` in
  `e2ee-bootstrap-gate-state.ts` (2026-07-15). Sign-out and bootstrap resolution
  dispatch single reducer actions.

## react-doctor/prefer-useReducer — E2eeBootstrap gate fields (resolved)

- **File**: `apps/web/components/e2ee-bootstrap.tsx`
- **Note**: See `e2ee-bootstrap-gate-state.ts` (2026-07-15).

## react-doctor/rerender-state-only-in-handlers — E2eeBootstrap reloadKey (resolved)

- **File**: `apps/web/components/e2ee-bootstrap.tsx`
- **Note**: Replaced `reloadKey` state with `bootstrapRunIdRef` + direct
  `rerunBootstrap()` invocation (2026-07-15).

## react-doctor/no-giant-component — E2eeBootstrap encryption gate (resolved)

- **File**: `apps/web/components/e2ee-bootstrap.tsx`
- **Note**: Dialog chrome extracted to `e2ee-bootstrap-dialog.tsx`; orchestrator
  is under 300 lines (2026-07-15).

## react-doctor/no-cascading-set-state — login session overlay + recovery (resolved)

- **File**: `apps/web/app/login/_content.tsx`
- **Note**: `overlayVisible`, `overlayFading`, and `requiresPasskeyStepUp` merged
  into `loginSessionUi` with single-object updates on recovery (2026-07-15).

## react-doctor/no-cascading-set-state — login invite URL prefill (resolved)

- **File**: `apps/web/app/login/_content.tsx`
- **Note**: Invite token and sign-up mode initialize from `LoginSearchParams`
  props; signup-domain fetch is the only remaining mount effect setter
  (2026-07-15).

## react-doctor/prefer-useReducer — LoginForm auth fields (resolved)

- **File**: `apps/web/app/login/_content.tsx` (`LoginFormBody`)
- **Note**: Form fields, chrome, and debounced validation slices consolidated
  into reducers in `login-form-state.ts` (2026-07-15).

## react-doctor/no-cascading-set-state — login debounced validation effects (resolved)

- **File**: `apps/web/app/login/_content.tsx`
- **Note**: Email availability and invite validation effects dispatch single
  reducer actions per transition (2026-07-15).

## react-doctor/async-await-in-loop — login auth status settle retries (resolved)

- **File**: `apps/web/app/login/_content.tsx`
- **Note**: `waitForSettledAuthStatus` refactored to recursive
  `settleAuthStatusAtIndex` with intentional staggered delays (2026-07-15).

## react-doctor/no-cascading-set-state — login session overlay fade (resolved)

- **File**: `apps/web/app/login/_content.tsx`
- **Note**: Overlay fade/hide uses two phased `loginSessionUi` updates (below
  cascading threshold); recovery path uses one object update (2026-07-15).

## react-doctor/nextjs-no-use-search-params-without-suspense — login entry wrapper

- **File**: `apps/web/app/login/login-form-entry.tsx`
- **Why FP**: `LoginForm` only reads search params and renders `LoginFormBody`
  inside `<Suspense>` from `app/login/page.tsx`. The static rule cannot see the
  parent boundary.

## react-doctor/react-compiler-destructure-method — login entry useSearchParams().get()

- **File**: `apps/web/app/login/login-form-params.ts` (`readLoginSearchParams`)
- **Why FP**: `ReadonlyURLSearchParams.get()` requires `this` context. Bound via
  `searchParams.get(...)` inside `readLoginSearchParams`, not destructured.

## react-doctor/no-event-handler + no-pass-data-to-parent — EventEditor prop sync

- **File**: `apps/web/components/event-editor.tsx`
- **Why FP**: Opening, closing, and `eventToEdit` changes must hydrate
  `useEventForm` (`resetForm` / `loadEventData` / view-mode) and reveal optional
  sections from the loaded event. This is prop→form synchronization, not a
  parent event handler or data lift. The calendar parent already owns
  `eventToEdit`; the editor cannot fetch it independently.
- **Config**: Suppressed via `react-doctor.config.json` → `ignore.overrides`
  for `**/components/event-editor.tsx`.

## react-doctor/no-cascading-set-state — EventEditor open/load effects

- **File**: `apps/web/components/event-editor.tsx`
- **Why FP**: Rule is retired. Remaining setters (`setEventViewMode` plus one
  batched `setSections`) are the minimum needed to hydrate form chrome when a
  different event is selected. Section flags are a single object update.
- **Config**: Suppressed via `ignore.overrides` for `**/components/event-editor.tsx`.

## react-doctor/no-prop-callback-in-effect + no-pass-data-to-parent — live event preview

- **File**: `apps/web/components/event-editor/event-editor-preview.ts`
- **Why FP**: Popover create/edit paints a ghost event on the calendar while the
  user types. The calendar already owns preview state (`updatePreviewEvent`);
  lifting the full editor form into a shared Provider would duplicate
  `useEventForm`. The effect is deduped with a payload-key ref so it only
  notifies when wall-clock fields actually change.
- **Config**: Suppressed via `ignore.overrides` for
  `**/components/event-editor/event-editor-preview.ts`.

## react-doctor/no-giant-component — ComposeForm

- **File**: `apps/web/components/mail/compose-dialog.tsx` (`ComposeForm`)
- **Why FP**: Compose is one surface (recipients, identity/signature swap, body
  editor, attachments, send-guard). Splitting would fragment tightly coupled
  draft state from `useMailCompose` without a new test seam — the exported
  `ComposeDialog` wrapper is the public entry.
- **Config**: Suppressed via `ignore.overrides` for
  `**/components/mail/compose-dialog.tsx`.

## react-doctor/no-event-handler — ComposeForm signature identity swap

- **File**: `apps/web/components/mail/compose-dialog.tsx`
- **Why FP**: Changing the From identity must rewrite the embedded signature in
  the current body. That is a context/identity sync into editor content, not a
  parent-owned click handler. The previous identity is tracked in a ref because
  the swap needs both old and new signature sources.
- **Config**: Suppressed via `ignore.overrides` for
  `**/components/mail/compose-dialog.tsx`.

## react-doctor/no-danger — ComposeForm signature preview

- **File**: `apps/web/components/mail/compose-dialog.tsx`
- **Why FP**: Below-quote signature preview must render identity HTML. The HTML
  is passed through `sanitizeSignatureHtml` at this boundary (script/style/
  embed tags and `on*` handlers stripped) before `dangerouslySetInnerHTML`.
  The rule cannot see sanitization.
- **Config**: Suppressed via `ignore.overrides` for
  `**/components/mail/compose-dialog.tsx`.

## react-doctor/no-giant-component — MessageReader (resolved)

- **Note**: Split into `use-message-reader-controller.tsx` plus focused subcomponents
  under `message-reader/` (2026-06-26). Orchestrator is ~38 lines.

## react-doctor/no-many-boolean-props — MessageReader loading flags (resolved)

- **File**: `apps/web/components/mail/message-reader-types.ts`
- **Note**: Async loading and navigation flags grouped into `loading` and
  `navigation` object props (2026-06-26). `isBusy` remains the sole top-level
  boolean workload flag.

## react-doctor/prefer-useReducer — MessageReader overlay chrome (resolved)

- **File**: `apps/web/components/mail/message-reader.tsx`
- **Note**: Popover/drawer/dialog visibility state was consolidated into
  `messageReaderChromeReducer` in `message-reader-ui-state.ts` (2026-06-26).
  Remaining `useState` slices (`allowExternalContent`, nested helper components)
  are independent and below the rule threshold.

## react-doctor/no-giant-component — MailAppContent (resolved)

- **File**: `apps/web/components/mail/mail-app.tsx`
- **Note**: Split into `use-mail-app-content-controller.tsx` and layout
  subcomponents under `mail-app/` (2026-06-26). `MailAppContent` is ~10 lines.

## react-doctor/prefer-useReducer — MailAppContent list chrome (resolved)

- **File**: `apps/web/components/mail/use-mail-app-content-controller.tsx`
- **Note**: List/search/filter dialog state uses `mailAppListChromeReducer` in
  `mail-app-list-chrome-state.ts` (2026-06-26).

## react-doctor/only-export-components — MailCompose bridge helpers

- **File**: `apps/web/components/mail/mail-compose-bridge.ts`
- **Why FP**: Module-level imperative bridge (`getMailComposeBridge`,
  `registerComposeDraftSaver`, etc.) must live outside React components so
  mail hooks and autosave can call compose state without mounting context.
  `mail-compose-context.tsx` now exports only hooks and `MailComposeProvider`.

## react-doctor/no-giant-component — MailComposeProvider (resolved)

- **File**: `apps/web/components/mail/mail-compose-provider.tsx`
- **Note**: Provider logic moved out of `mail-compose-context.tsx`; seed
  builders live in `mail-compose-seed.ts`, reducer in `mail-compose-state.ts`
  (2026-06-26).

## react-doctor/prefer-useReducer — MailComposeProvider (resolved)

- **File**: `apps/web/components/mail/mail-compose-provider.tsx`
- **Note**: Draft and chrome fields consolidated into `mailComposeReducer` in
  `mail-compose-state.ts` (2026-06-26).

## react-doctor/no-giant-component — RichTextEditor (resolved)

- **File**: `apps/web/components/mail/rich-text-editor.tsx`
- **Note**: Toolbar, table picker, and TipTap extensions split into
  `rich-text-editor-toolbar.tsx`, `rich-text-editor-table-picker.tsx`, and
  `rich-text-editor-extensions.ts` (2026-06-26).

## react-doctor/no-event-handler — RichTextEditor TipTap prop sync

- **File**: `apps/web/components/mail/rich-text-editor.tsx`
- **Why FP**: `content` and `disabled` are synchronized imperatively via
  `editor.commands.setContent` / `editor.setEditable` in effects because
  TipTap's `useEditor` hook owns editor lifecycle. Callback refs are synced in
  effects so drop/paste handlers always invoke the latest parent callbacks
  without recreating the editor.

## react-doctor/prefer-useReducer — MessageList overlay chrome (resolved)

- **File**: `apps/web/components/mail/message-list.tsx`
- **Note**: Selection and thread-expand UI state consolidated into
  `messageListReducer` in `message-list/message-list-state.ts` (2026-07-01).

## react-doctor/no-giant-component — MessageList (resolved)

- **File**: `apps/web/components/mail/message-list.tsx`
- **Note**: Split into `message-list-bulk-bar.tsx`, `message-list-row.tsx`,
  `message-list-virtualized.tsx`, and `message-list-utils.ts` (2026-07-01).
  Orchestrator is ~220 lines.

## react-hooks-js/incompatible-library — @tanstack/react-virtual

- **File**: `apps/web/components/mail/message-list/message-list-virtualized.tsx`
- **Why FP**: `useVirtualizer` is incompatible with React Compiler memoization.
  Virtualization is isolated in `MessageListVirtualized` with the `"use no memo"`
  directive so the rest of the list tree remains compiler-friendly.

## react-doctor/prefer-tag-over-role — MessageList row shell

- **File**: `apps/web/components/mail/message-list/message-list-row.tsx`
- **Why FP**: The row shell must remain a non-`<button>` container because it
  nests the avatar selection `<button>`. HTML forbids nested buttons; the row
  uses `role="button"` + keyboard handlers instead. Expanded thread children use
  native `<button>` elements where no nesting occurs.

## react-doctor/no-event-handler — MessageList infinite scroll

- **File**: `apps/web/components/mail/message-list/message-list-virtualized.tsx`
- **Why FP**: Scroll/resize listeners and virtual-window proximity checks react
  to layout and viewport position. They are not parent event callbacks; refs
  hold the latest `onLoadMore` state so subscriptions stay stable.

## react-doctor/no-pass-data-to-parent — MessageList virtual proximity load

- **File**: `apps/web/components/mail/message-list/message-list-virtualized.tsx`
- **Why FP**: The effect that calls `scheduleLoadMore` when the last virtual
  item nears the list end triggers pagination inside the list surface. It does
  not lift scroll metrics to a parent — it invokes the existing `onLoadMore`
  callback already passed as a prop.

- **File**: `apps/web/components/mail/recipient-suggest-input.tsx`
- **Note**: Removed `role="listbox"` / `role="option"` in favor of a combobox
  popup (`role="combobox"` on the input, `aria-controls` + labeled suggestion
  buttons). Native `<datalist>` cannot render avatars, sections, or keyboard
  highlight state (2026-06-26).

## react-doctor/no-many-boolean-props — MobileMailHeader (resolved)

- **File**: `apps/web/components/mail/mail-app-mobile-header.tsx`
- **Note**: List-only mobile header; refresh affordance grouped as
  `refresh: { disabled, spinning }` (2026-06-26). Reader/compose chrome on
  mobile remains in `MessageReader` / compose surfaces.

## react-doctor/no-giant-component — CalendarDndProvider

- **File**: `packages/ui/src/components/calendar/calendar-dnd-context.tsx`
- **Why FP**: `CalendarDndProvider` is a single dnd-kit drag session: sensors,
  start/over/end handlers, overlay preview, and context for active event
  dimensions. Splitting the provider would fragment one coordinated drag
  lifecycle without a reusable seam. The file was only touched to pass
  `EventItem`'s `dragging` prop.
- **Config**: Suppressed via `react-doctor.config.json` → `ignore.overrides`
  for `**/components/calendar/calendar-dnd-context.tsx`.

## react-doctor/prefer-useReducer — CalendarDndProvider drag session fields

- **File**: `packages/ui/src/components/calendar/calendar-dnd-context.tsx`
- **Why FP**: The `useState` slices (`activeEvent`, `activeId`, `activeView`,
  `currentTime`, dimensions, multi-day width, handle position) update on
  independent dnd-kit callbacks, not as one state machine. A reducer would
  add boilerplate without reducing related-update bugs. Overlay snapshot is
  memoized separately.
- **Config**: Suppressed via `ignore.overrides` for
  `**/components/calendar/calendar-dnd-context.tsx`.

## next-themes React 19 "Encountered a script tag" (not a react-doctor rule)

- **File**: `packages/ui/src/providers/theme-provider.tsx`
- **Why FP**: `next-themes` renders an inline `<script>` (via
  `React.createElement("script", …)`) so the correct theme class is applied
  before hydration (no FOUC). React 19 logs that client-rendered scripts are
  never executed; the script still runs correctly on SSR. Upstream issue:
  https://github.com/pacocoursey/next-themes/issues/385. We filter that
  specific `console.error` in development only (same approach as the shadcn
  Next.js dark-mode docs).
