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

- **Files**: `packages/ui/src/components/ui/button.tsx`,
  `packages/ui/src/components/ui/badge.tsx`
- **Why FP**: shadcn/ui's component template colocates `xxxVariants` (a
  cva-built helper) with the component itself. Splitting these defeats the
  reason callers import from a single file and is an upstream convention we
  intentionally follow.

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
  `apps/native/app/(tabs)/settings/index.tsx:197`
- **Why FP**: `Array.prototype.toSorted` is ES2023. The native app tsconfig
  uses `lib: ["DOM", "ES2022"]` and `target: ES2022`. The existing
  `[...arr].sort(compareFn)` pattern is already immutable (spread creates a
  new array). Upgrading to ES2023 lib is deferred.

## react-doctor/no-giant-component — MessageReader (resolved)

- **File**: `apps/web/components/mail/message-reader.tsx`
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

## react-doctor/no-many-boolean-props — MobileMailHeader (resolved)

- **File**: `apps/web/components/mail/mail-app-mobile-header.tsx`
- **Note**: List-only mobile header; refresh affordance grouped as
  `refresh: { disabled, spinning }` (2026-06-26). Reader/compose chrome on
  mobile remains in `MessageReader` / compose surfaces.
