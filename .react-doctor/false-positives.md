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
