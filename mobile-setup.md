# Mobile Setup

## Goal
Add a clean Expo mobile app for calendar management while keeping the web app intact and sharing the calendar core.

## Current State
- Web app: `apps/web`
- Backend API: `apps/backend`
- Shared UI/calendar code: `packages/ui`
- Existing mobile-like web components exist, but they still depend on browser-only APIs.

## What to Share
Move these into shared packages or keep them platform-agnostic:
- calendar types and DTOs
- date/range utilities
- event normalization and validation
- API client
- React Query hooks for calendar data
- settings/storage interfaces

## What Not to Share Directly
Keep these platform-specific:
- Next.js pages and routing
- shadcn/Radix components
- DOM drag/drop and mouse-specific logic
- `window`, `document`, `localStorage`, `sessionStorage`
- browser-only layout logic

## Recommended Target Structure
```txt
apps/
  web/
  backend/
  notifications/
  mobile/        # Expo app
packages/
  ui/            # shared web UI + web calendar UI
  calendar-core/  # shared calendar logic, types, validation
  calendar-client/# shared API client + hooks
  storage/       # optional storage adapters
```

## Migration Plan

### Phase 1: Extract the core
1. Move calendar types from `packages/ui/src/components/calendar/types.ts` into `packages/calendar-core`.
2. Move date and event helpers from `packages/ui/src/components/calendar/utils.ts`.
3. Move shared constants (`AgendaDaysToShow`, `EventHeight`, etc.).
4. Replace direct browser storage usage with adapter interfaces.

Status: done

### Phase 2: Share the data layer
1. Extract `apps/web/lib/calendar-api-service.ts` into `packages/calendar-client`.
2. Extract the calendar query hook logic from `apps/web/hooks/use-calendar-data.ts`.
3. Keep API calls pointing at `apps/backend`.
4. Make auth/session access injectable so web and mobile can differ.

Status: done

### Phase 3: Create Expo app
1. Add `apps/mobile` with Expo Router.
2. Add navigation for:
   - month
   - week
   - day
   - agenda
   - event editor
   - settings/calendars
3. Use shared core + client packages.
4. Implement native storage for preferences and cached date/view state.

Status: in progress

### Phase 4: Solve auth
Recommended approach:
- keep backend auth as source of truth
- add a mobile-compatible auth flow (token or session bridge)
- avoid relying on browser cookies only

### Phase 5: Mobile polish
1. Add push notifications later.
2. Add offline cache/sync.
3. Add deep links for events.
4. Add native gestures and bottom navigation.

## Expo Setup Notes
- Use Expo Router.
- Use React Query for server state.
- Use a native-safe storage layer like AsyncStorage.
- Prefer `react-native-safe-area-context` and `react-native-gesture-handler`.
- Avoid web-only dependencies inside mobile screens.

## Reuse vs Rewrite
Reuse:
- data fetching
- date math
- event models
- validation
- business rules

Rewrite for mobile:
- calendar screen layout
- navigation
- drag/drop interaction
- sheets/modals
- view switching UI

## Suggested First Implementation Order
1. create shared calendar-core package
2. create shared calendar-client package
3. bootstrap Expo app
4. wire auth
5. build month/day/agenda screens
6. add edit/create event flow
7. add settings/calendars screens

## Success Criteria
- mobile app can sign in
- mobile app can read calendars and events
- mobile app can create/edit/delete events
- shared logic is used by both web and mobile
- no browser-only code leaks into Expo screens

## Notes
- Keep the web app working during migration.
- Move logic first, UI last.
- Avoid duplicating business rules in both apps.
