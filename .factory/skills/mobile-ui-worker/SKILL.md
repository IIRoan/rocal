---
name: mobile-ui-worker
description: Implements mobile UI components using NativeWind v5 Tailwind classes to match web design
---

# Mobile UI Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

For any feature that involves creating or modifying mobile UI components, NativeWind configuration, or React Native screen layouts in the Solace mobile app.

## Work Procedure

1. **Read the feature description carefully.** Understand what needs to be built and which validation assertions it fulfills.

2. **Read the reference web components.** Before writing any mobile code, read the corresponding web component(s) to understand the exact Tailwind classes, layout structure, and design tokens used. The mobile version must visually match.

3. **Read existing mobile code.** Understand what's already there and what needs to change. Check for patterns established by previous features.

4. **Read `.factory/library/` files** for architecture decisions, NativeWind v5 specifics, and design tokens.

5. **Implement the feature:**
   - Use NativeWind v5 Tailwind classes matching the web component's classes
   - Create `.native.tsx` files for React Native-specific implementations
   - Use `cn()` for class merging
   - NO `StyleSheet.create()`, NO hardcoded colors
   - Ensure minimum 44pt touch targets on interactive elements
   - Support dark mode via Tailwind dark: classes

6. **Verify with typecheck and lint:**
   - Run `cd C:\Users\Roan\Documents\rocal\apps\mobile && bun run typecheck`
   - Run `cd C:\Users\Roan\Documents\rocal\apps\mobile && bun run lint`
   - Fix all errors before completing

7. **Check web is unbroken** (if you modified shared packages/ui files):
   - Run `cd C:\Users\Roan\Documents\rocal\apps\web && bun run build`
   - If build fails due to your changes, fix immediately

8. **Self-review checklist:**
   - No hardcoded colors? (`rg "#[0-9a-fA-F]" path/to/new/files`)
   - No `StyleSheet.create` in migrated components?
   - All interactive elements have 44pt+ touch targets?
   - Dark mode classes present where web uses them?
   - Classes match web component structure?

## Example Handoff

```json
{
  "salientSummary": "Rewrote MobileDayView to use NativeWind v5 Tailwind classes matching web's day-view.tsx layout. 24-hour timeline with 60px cells, time column, overlapping event positioning. Typecheck and lint pass. No hardcoded colors remain.",
  "whatWasImplemented": "Created mobile-day-view.native.tsx with NativeWind classes matching web day view: time column (w-[52px]), hour cells (h-[60px]), event cards with bg-event-* colors, current time indicator with bg-destructive. Dark mode supported via dark: variants.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "cd apps/mobile && bun run typecheck", "exitCode": 0, "observation": "No type errors" },
      { "command": "cd apps/mobile && bun run lint", "exitCode": 0, "observation": "No lint errors" },
      { "command": "rg '#[0-9a-fA-F]{3,8}' packages/ui/src/components/calendar/mobile-day-view.native.tsx", "exitCode": 1, "observation": "No hardcoded colors found" }
    ],
    "interactiveChecks": []
  },
  "tests": { "added": [] },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- A web component you need to reference doesn't exist or has an unexpected structure
- NativeWind v5 doesn't support a specific Tailwind class needed for web parity
- A shared component change would break the web app build
- Feature depends on another feature that isn't complete yet
- Package installation fails or dependency conflicts arise
