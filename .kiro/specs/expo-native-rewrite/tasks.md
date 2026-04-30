# Implementation Plan: Expo Native Rewrite

## Overview

This plan implements the Expo React Native app (`apps/native`) to replace the Capacitor/Ionic WebView mobile experience. The approach is bottom-up: first extract shared packages from `apps/web/lib/`, then scaffold the Expo project, build infrastructure providers, implement screens and features, and finally wire everything together. Each task builds incrementally on previous work so there is no orphaned code.

## Tasks

- [x] 1. Create `packages/design-tokens` shared package
  - [x] 1.1 Scaffold `packages/design-tokens` with `package.json`, `tsconfig.json`, and `src/index.ts`
    - Define the `ColorScale`, `ThemeTokens`, `CalendarColor`, and `ShadowTokenValue` TypeScript interfaces
    - Export `lightTheme` and `darkTheme` objects with all required keys: `colors` (including all 12 calendar colors), `spacing`, `typography` (fontFamily, fontSize, fontWeight), `borderRadius`, `shadows`
    - Export a `toTailwindTheme()` adapter function for web consumption
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x] 1.2 Write property test for design token completeness
    - **Property 1: Design token completeness**
    - Verify both light and dark themes contain all required keys and correct value types
    - Use `fast-check` to generate theme variant selections and validate structure
    - **Validates: Requirements 2.2, 3.1, 3.5**

  - [x] 1.3 Update `apps/web` to consume design tokens from the shared package
    - Replace hardcoded theme values in the web app's Tailwind config with `toTailwindTheme()` output
    - Update imports to reference `@workspace/design-tokens`
    - _Requirements: 3.2, 3.4_

- [x] 2. Create `packages/calendar-core` shared package
  - [x] 2.1 Scaffold `packages/calendar-core` with `package.json`, `tsconfig.json`, and `src/` directory
    - Extract TypeScript type definitions from `apps/web/lib/types/calendar.ts` into `src/types.ts`
    - Extract date utility functions from `apps/web/lib/calendar-view-model.ts` into `src/date-utils.ts` and `src/view-model.ts`
    - Extract validation logic into `src/validation.ts`
    - Extract calendar helper functions from `apps/web/lib/calendar-ui-helpers.ts` into `src/calendar-helpers.ts`
    - Create barrel export in `src/index.ts`
    - _Requirements: 4.3, 4.4, 4.5_

  - [x] 2.2 Write property test for calendar date range validity
    - **Property 3: Calendar date range validity**
    - For any valid base date, view type, and week start day, verify `getDefaultCalendarDateRange` returns `start <= end` with the base date within `[start, end]`
    - **Validates: Requirements 4.4**

  - [x] 2.3 Write property test for visible calendar event filtering
    - **Property 7: Visible calendar event filtering**
    - For any set of calendars with arbitrary visibility and any set of events, verify `transformCalendarEvents` returns only events whose `calendarId` belongs to a visible calendar
    - **Validates: Requirements 6.9**

  - [x] 2.4 Write property test for event validation correctness
    - **Property 8: Event validation correctness**
    - For any event data, verify `validateEventData` returns errors when title is empty/whitespace, end <= start, title > 255 chars, or description > 1000 chars, and returns empty errors for valid data
    - **Validates: Requirements 7.3**

  - [x] 2.5 Write property test for calendar view navigation period
    - **Property 5: Calendar view navigation period**
    - For any current date and view type, verify swiping forward/backward advances/subtracts exactly one period and the result is deterministic
    - **Validates: Requirements 6.6**

  - [x] 2.6 Write property test for week start day in calendar grid
    - **Property 6: Week start day in calendar grid**
    - For any week start day config (0 or 1) and target date, verify the first day of the generated week grid matches the configured start day and the grid contains exactly 7 consecutive days
    - **Validates: Requirements 6.8**

  - [x] 2.7 Update `apps/web` to import from `@workspace/calendar-core` instead of local files
    - Replace imports of types, date utils, view model, validation, and calendar helpers
    - Remove or deprecate the extracted source files in `apps/web/lib/`
    - _Requirements: 4.5, 4.7_

- [x] 3. Create `packages/calendar-client` shared package
  - [x] 3.1 Scaffold `packages/calendar-client` with `package.json`, `tsconfig.json`, and `src/` directory
    - Extract `HttpClient` class from `apps/web/lib/http-client.ts` into `src/http-client.ts`
    - Make `HttpClient` accept `baseURL` via config and an optional `getHeaders` callback for platform-specific auth headers
    - Extract `CalendarApiService` from `apps/web/lib/calendar-api-service.ts` into `src/calendar-api-service.ts`
    - Make `CalendarApiService` accept an `E2eeProvider` interface instead of importing web-specific E2EE modules
    - Create barrel export in `src/index.ts`
    - _Requirements: 4.1, 4.2, 4.6_

  - [x] 3.2 Write property test for HTTP client retry behavior
    - **Property 2: HTTP client retry behavior**
    - For any HTTP status code and retry config, verify retries on 5xx/408/429/network errors up to configured count, and no retries on 401/403/404
    - **Validates: Requirements 4.1**

  - [x] 3.3 Update `apps/web` to import from `@workspace/calendar-client` instead of local files
    - Replace imports of `HttpClient` and `CalendarApiService`
    - Provide web-specific `getHeaders` and `E2eeProvider` implementations at the app level
    - Remove or deprecate the extracted source files in `apps/web/lib/`
    - _Requirements: 4.6, 4.7_

- [x] 4. Create `packages/e2ee` shared package
  - [x] 4.1 Scaffold `packages/e2ee` with `package.json`, `tsconfig.json`, and `src/` directory
    - Define the `CryptoProvider` interface in `src/crypto-provider.ts` abstracting the SubtleCrypto API
    - Define the `E2eeProvider` interface in `src/provider.ts`
    - Extract E2EE logic from `apps/web/lib/e2ee-*.ts` into `src/index.ts` with `createE2eeModule(crypto: CryptoProvider)` factory
    - Create barrel export
    - _Requirements: 11.7, 11.1_

  - [x] 4.2 Write property test for E2EE encrypt-hydrate round-trip
    - **Property 10: E2EE encrypt-hydrate round-trip**
    - For any event with non-empty title, optional description, and optional location, verify encrypting then decrypting with the same session preserves original values
    - **Validates: Requirements 11.1, 11.2, 11.3**

  - [x] 4.3 Write property test for password envelope round-trip
    - **Property 11: Password envelope round-trip**
    - For any non-empty password, account key, and blind index key, verify creating then unwrapping a password envelope recovers equivalent keys
    - **Validates: Requirements 11.5**

  - [x] 4.4 Write property test for encrypted event placeholder without session
    - **Property 12: Encrypted event placeholder without session**
    - For any event with `encryptionState === "encrypted"` and non-null `encryptedContent`, verify `hydrateEncryptedEvent` returns title "Encrypted event" and null description/location when no session is active
    - **Validates: Requirements 11.6**

  - [x] 4.5 Update `apps/web` to import from `@workspace/e2ee` instead of local E2EE files
    - Provide web `CryptoProvider` wrapping `window.crypto`
    - Replace all E2EE imports to use the shared package
    - _Requirements: 11.7_

- [x] 5. Checkpoint — Shared packages complete
  - Ensure all tests pass (`bun run test`), run `bun run typecheck` and `bun run lint`
  - Verify `apps/web` still builds and functions correctly with the extracted shared packages
  - Ask the user if questions arise

- [x] 6. Scaffold `apps/native` Expo project
  - [x] 6.1 Initialize the Expo project at `apps/native`
    - Create `apps/native` using Expo SDK 55 (React Native 0.83, React 19.2) with Expo Router v55, TypeScript
    - Configure `package.json` with workspace dependencies: `@workspace/design-tokens`, `@workspace/calendar-core`, `@workspace/calendar-client`, `@workspace/e2ee`, `@workspace/logger`
    - Add dev dependencies: `jest@~29.7.0`, `@testing-library/react-native`, `fast-check`, `eslint-config-expo@~55.0.0`
    - Add scripts: `dev`, `build:ios`, `build:android`, `lint`, `typecheck`, `test`
    - Note: SDK 55 dropped Legacy Architecture support; `newArchEnabled` config is removed
    - Note: SDK 55 auto-configures Metro for monorepos — no manual `watchFolders`/`nodeModulesPaths`/`disableHierarchicalLookup` needed
    - Note: `"main": "expo-router/entry"` in package.json (no separate index.js file)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_

  - [x] 6.2 Configure monorepo integration
    - Add `apps/native` to root `package.json` workspace resolution
    - Add `dev:native` script to root `package.json`
    - Configure `metro.config.js` — use minimal config with `getDefaultConfig(__dirname)` only (SDK 55 auto-detects monorepo)
    - Configure `tsconfig.json` with path aliases for workspace packages
    - _Requirements: 1.4, 1.6_

  - [x] 6.3 Set up the Expo Router file-based navigation structure
    - Create `app/_layout.tsx` (root layout placeholder)
    - Create `app/(auth)/_layout.tsx`, `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx`
    - Create `app/(tabs)/_layout.tsx` with bottom tab bar (Calendar, Search, Settings)
    - Create `app/(tabs)/calendar/_layout.tsx`, `app/(tabs)/calendar/index.tsx`
    - Create `app/(tabs)/search/_layout.tsx`, `app/(tabs)/search/index.tsx`
    - Create `app/(tabs)/settings/_layout.tsx`, `app/(tabs)/settings/index.tsx`
    - Create `app/event/[id].tsx`, `app/event/create.tsx`, `app/event/edit/[id].tsx`
    - Create `app/calendar-manage/index.tsx`, `app/calendar-manage/create.tsx`, `app/calendar-manage/edit/[id].tsx`
    - Create `app/category-manage/index.tsx`, `app/category-manage/create.tsx`, `app/category-manage/edit/[id].tsx`
    - Create `app/subscription/index.tsx`, `app/subscription/create.tsx`, `app/subscription/edit/[id].tsx`
    - Create `app/+not-found.tsx`
    - _Requirements: 17.1, 17.2, 17.4_

- [x] 7. Implement infrastructure providers
  - [x] 7.1 Implement `ThemeProvider` with design token integration
    - Create `src/providers/ThemeProvider.tsx` providing `ThemeContextValue` via React Context
    - Read theme preference from local cache, listen to `useColorScheme()` for system changes
    - Resolve to `lightTheme` or `darkTheme` from `@workspace/design-tokens`
    - Export `useTheme()` hook
    - _Requirements: 2.2, 2.3, 2.4, 12.2_

  - [ ]* 7.2 Write property test for theme preference resolution
    - **Property 13: Theme preference resolution**
    - For any theme preference ("light", "dark", "system") and system color scheme, verify the ThemeProvider resolves to the correct theme object
    - **Validates: Requirements 12.2**

  - [x] 7.3 Implement `AuthProvider` with Better Auth and secure storage
    - Create `src/providers/AuthProvider.tsx` providing `AuthContextValue` via React Context
    - Configure Better Auth client with native API base URL
    - Persist session tokens in `expo-secure-store` (iOS Keychain / Android Keystore)
    - Implement `signIn`, `signUp`, `signOut`, `signInWithPasskey` methods
    - Handle 401/403 responses by clearing session and redirecting to sign-in
    - Export `useAuth()` hook
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 7.4 Write property test for auth session termination
    - **Property 4: Auth session termination**
    - For any authenticated state, verify that 401/403/session expiry clears the session token from secure storage and transitions to unauthenticated state
    - **Validates: Requirements 5.4, 5.6**

  - [x] 7.5 Implement native `CryptoProvider` and E2EE provider
    - Create `src/providers/E2eeProvider.tsx` wrapping `@workspace/e2ee` with native `CryptoProvider` using `expo-crypto` (SDK 55 added AES-GCM support) and `react-native-quick-crypto`
    - Store device key pair in `expo-secure-store`
    - Implement E2EE bootstrap flow on authentication
    - _Requirements: 11.1, 11.4, 11.7_

  - [x] 7.6 Set up React Query client and API service instances
    - Create `src/providers/QueryProvider.tsx` with `QueryClient` configuration
    - Create `src/lib/api.ts` instantiating `HttpClient` and `CalendarApiService` from `@workspace/calendar-client` with native base URL and auth headers
    - Define `QUERY_KEYS` constants for cache key management
    - _Requirements: 4.1, 4.6, 16.1_

  - [x] 7.7 Wire all providers into the root layout
    - Update `app/_layout.tsx` to wrap the app with `QueryProvider`, `AuthProvider`, `ThemeProvider`, and `E2eeProvider`
    - Add navigation guard: redirect unauthenticated users to `(auth)` group, authenticated users to `(tabs)` group
    - _Requirements: 17.1, 5.4_

- [ ] 8. Checkpoint — Project scaffolding and providers complete
  - Ensure all tests pass, run typecheck and lint
  - Verify the app compiles and renders the tab navigation shell
  - Ask the user if questions arise

- [ ] 9. Implement authentication screens
  - [ ] 9.1 Implement sign-in screen
    - Build `app/(auth)/sign-in.tsx` with email/password form, validation, error display
    - Add passkey sign-in button using `useAuth().signInWithPasskey`
    - Show inline errors for invalid credentials and passkey failures
    - Style with `StyleSheet.create()` using `useTheme()` tokens
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 9.2 Implement sign-up screen
    - Build `app/(auth)/sign-up.tsx` with name, email, password form
    - Add validation and inline error display
    - Navigate to calendar on successful sign-up
    - _Requirements: 5.2_

  - [ ]* 9.3 Write unit tests for auth screens
    - Test form validation, error display, and navigation on success
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 10. Implement calendar view components
  - [ ] 10.1 Implement `MonthGrid` component
    - Create `src/components/calendar/MonthGrid.tsx` displaying a month grid with day cells and event dot indicators
    - Respect week start day from user settings
    - Style with `StyleSheet.create()` using theme tokens
    - _Requirements: 6.1, 6.8, 6.9_

  - [ ] 10.2 Implement `WeekTimeline` component
    - Create `src/components/calendar/WeekTimeline.tsx` displaying 7 columns with time slots and positioned event blocks
    - Render events from visible calendars with assigned colors
    - _Requirements: 6.2, 6.9_

  - [ ] 10.3 Implement `DayTimeline` and `ThreeDayTimeline` components
    - Create `src/components/calendar/DayTimeline.tsx` for single-day time grid
    - Create `src/components/calendar/ThreeDayTimeline.tsx` for 3-column time grid
    - Share common time grid rendering logic between day/week/three-day views
    - _Requirements: 6.3, 6.4_

  - [ ] 10.4 Implement `AgendaList` component
    - Create `src/components/calendar/AgendaList.tsx` using `FlatList` with section headers for chronological event list
    - Support pull-to-refresh to reload event data
    - _Requirements: 6.5, 14.6_

  - [ ] 10.5 Implement `CalendarViewSwitcher` and `SkeletonLoader`
    - Create `src/components/calendar/CalendarViewSwitcher.tsx` header control to switch between month/week/day/3day/agenda views
    - Create `src/components/calendar/SkeletonLoader.tsx` with placeholder UI matching each calendar view layout
    - _Requirements: 6.10_

  - [ ] 10.6 Implement swipe navigation for calendar views
    - Add horizontal swipe gesture handling using `react-native-gesture-handler` to navigate between time periods
    - Integrate with `react-native-reanimated` for smooth 60fps transitions
    - _Requirements: 6.6, 6.7_

  - [ ] 10.7 Wire calendar views into the calendar screen
    - Update `app/(tabs)/calendar/index.tsx` to render the active calendar view based on user settings
    - Fetch events via `CalendarApiService` using React Query with proper date range
    - Show `SkeletonLoader` while loading
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.10, 16.1_

- [ ] 11. Checkpoint — Calendar views complete
  - Ensure all tests pass, run typecheck and lint
  - Verify all five calendar views render correctly with mock data
  - Ask the user if questions arise

- [ ] 12. Implement event management screens
  - [ ] 12.1 Implement `EventCard` component
    - Create `src/components/event/EventCard.tsx` for compact event display in timeline views
    - Display title, time, calendar color, and category indicator
    - _Requirements: 6.9, 7.2_

  - [ ] 12.2 Implement `EventForm` component
    - Create `src/components/event/EventForm.tsx` with fields for title, date/time pickers, calendar selector, category selector, location, description, color picker, all-day toggle, recurrence picker, and reminders
    - Implement client-side validation using `validateEventData` from `@workspace/calendar-core`
    - Display inline validation errors and server-side error messages
    - _Requirements: 7.1, 7.3, 7.8_

  - [ ] 12.3 Implement `RecurrencePicker` and `ColorPicker` components
    - Create `src/components/event/RecurrencePicker.tsx` for recurrence rule builder (daily/weekly/monthly/yearly) with occurrence preview
    - Create `src/components/event/ColorPicker.tsx` for calendar color palette selector (12 colors from design tokens)
    - _Requirements: 7.7, 8.5_

  - [ ] 12.4 Implement event detail screen
    - Build `app/event/[id].tsx` displaying full event details with edit and delete actions
    - Support recurring event scope options (this occurrence, this and future, all occurrences) for edit/delete
    - _Requirements: 7.2, 7.5, 7.6_

  - [ ] 12.5 Implement event create and edit screens
    - Build `app/event/create.tsx` using `EventForm` with create API call via `CalendarApiService`
    - Build `app/event/edit/[id].tsx` using `EventForm` pre-populated with existing event data
    - Invalidate React Query cache on success and navigate back
    - _Requirements: 7.1, 7.4, 7.6_

  - [ ] 12.6 Write unit tests for event management
    - Test `EventForm` validation, `EventCard` rendering, and create/edit/delete flows
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 13. Implement calendar and category management screens
  - [ ] 13.1 Implement calendar management screens
    - Build `app/calendar-manage/index.tsx` displaying calendar list with name, color, and visibility toggle
    - Build `app/calendar-manage/create.tsx` with name and color selection form
    - Build `app/calendar-manage/edit/[id].tsx` with edit form and delete action (with move/delete events options)
    - Implement calendar sharing: enable, view, and disable ICS share links
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 13.2 Implement category management screens
    - Build `app/category-manage/index.tsx` displaying category list with name, color, and active status
    - Build `app/category-manage/create.tsx` with name and color selection form
    - Build `app/category-manage/edit/[id].tsx` with edit form and delete action
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ] 13.3 Write unit tests for calendar and category management
    - Test list rendering, form validation, and CRUD operations
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_

- [ ] 14. Implement settings screen
  - [ ] 14.1 Implement settings screen with all preference sections
    - Build `app/(tabs)/settings/index.tsx` with sections: display preferences, time/timezone, working hours, notification preferences, default event settings, UI preferences
    - Implement theme selection (light, dark, system) wired to `ThemeProvider`
    - Implement optimistic updates: persist to Backend_API via `CalendarApiService` and update local UI immediately
    - Cache settings locally for offline access
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ] 14.2 Write unit tests for settings screen
    - Test setting changes, optimistic updates, and theme switching
    - _Requirements: 12.1, 12.2, 12.5_

- [ ] 15. Checkpoint — Core CRUD screens complete
  - Ensure all tests pass, run typecheck and lint
  - Verify event, calendar, category, and settings CRUD flows work end-to-end with the API
  - Ask the user if questions arise

- [ ] 16. Implement search functionality
  - [ ] 16.1 Implement search screen
    - Build `app/(tabs)/search/index.tsx` with search input, debounced API calls (300ms), and scrollable results list
    - Display event title, date, time, calendar name, and category in results
    - Support blind index token search for encrypted events via `E2eeProvider`
    - Navigate to event detail on result tap
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 16.2 Write property test for search debounce
    - **Property 15: Search debounce**
    - For any sequence of N input changes within 300ms, verify exactly one API call is triggered with the last input value
    - **Validates: Requirements 15.5**

- [ ] 17. Implement gesture-based interactions
  - [ ] 17.1 Implement `DraggableEvent` for drag-and-drop rescheduling
    - Create `src/components/event/DraggableEvent.tsx` using `react-native-gesture-handler` for long-press drag
    - Support dragging to new time slots on day/week/three-day views
    - Support dragging to new day columns on week/three-day views
    - Preserve event duration when rescheduling
    - Provide haptic feedback via `expo-haptics` on drag start, hover, and drop
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ]* 17.2 Write property test for drag-drop duration preservation
    - **Property 14: Drag-drop event rescheduling preserves duration**
    - For any event with start/end and any valid drop target, verify the rescheduled event has the same duration and correct new start/end times
    - **Validates: Requirements 14.1, 14.2, 14.3**

  - [ ] 17.3 Implement `SwipeableEventRow` for swipe-to-delete
    - Create `src/components/event/SwipeableEventRow.tsx` using `react-native-gesture-handler`
    - Add confirmation step before deletion
    - Integrate into `AgendaList` component
    - _Requirements: 14.5_

- [ ] 18. Implement push notifications
  - [ ] 18.1 Implement push notification registration and handling
    - Create `src/lib/notifications.ts` using `expo-notifications` for permission requests, token registration, and notification handling
    - Register device push token with Backend_API on permission grant
    - Schedule local notifications for event reminders at configured minutes-before time
    - Handle notification taps to navigate to event detail screen
    - Support multiple reminder times per event
    - Show guidance in settings when permission is denied
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 18.2 Write property test for notification scheduling time
    - **Property 9: Notification scheduling time**
    - For any event start time and reminder N minutes before, verify the computed notification time equals `event.start - N minutes`
    - **Validates: Requirements 10.3**

- [ ] 19. Implement calendar subscriptions
  - [ ] 19.1 Implement subscription management screens
    - Build `app/subscription/index.tsx` displaying subscription list with name, URL, sync status, and last sync time
    - Build `app/subscription/create.tsx` with name and ICS feed URL form
    - Build `app/subscription/edit/[id].tsx` with edit form, manual sync trigger, and delete action (with option to delete synced events)
    - Support ICS file import from device file system
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ]* 19.2 Write unit tests for subscription management
    - Test subscription list rendering, create/edit/delete flows, and sync trigger
    - _Requirements: 13.1, 13.2, 13.3, 13.5_

- [ ] 20. Implement deep linking and offline support
  - [ ] 20.1 Configure deep linking with Expo Router
    - Set up URL scheme (`solace://`) for deep link handling
    - Map deep link patterns to screens: `solace://event/{id}`, `solace://calendar`, `solace://settings`
    - Handle unknown patterns with fallback to calendar home
    - _Requirements: 17.5_

  - [ ]* 20.2 Write property test for deep link resolution
    - **Property 16: Deep link resolution**
    - For any valid deep link URL matching the app's scheme, verify correct screen name and parameter extraction; for unknown patterns, verify fallback to calendar home
    - **Validates: Requirements 17.5**

  - [ ] 20.3 Implement offline support with React Query persistence
    - Configure React Query cache persistence for events, calendars, categories, and settings
    - Display "offline" banner when network is unavailable with cached data
    - Auto-refetch on connectivity restoration
    - Show error message with retry button for failed write operations
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [ ] 21. Checkpoint — All features complete
  - Ensure all tests pass (`bun run test`), run `bun run typecheck` and `bun run lint`
  - Verify all screens, gestures, notifications, search, subscriptions, deep linking, and offline support work correctly
  - Ask the user if questions arise

- [ ] 22. Configure backend CORS and remove Capacitor/Ionic
  - [ ] 22.1 Update backend CORS configuration for native app
    - Add native app origin to `TRUSTED_ORIGINS` in backend environment
    - Ensure cookie settings work with native app requests
    - _Requirements: 5.7_

  - [ ] 22.2 Remove Capacitor and Ionic dependencies from `apps/web`
    - Remove Capacitor packages: `@capacitor/core`, `@capacitor/app`, `@capacitor/browser`, `@capacitor/haptics`, `@capacitor/keyboard`, `@capacitor/status-bar`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`
    - Remove Ionic packages: `@ionic/react`, `ionicons`, `ionic.config.json`
    - Remove `capacitor.config.ts` and `ios/` and `android/` directories from `apps/web/`
    - Remove mobile-specific scripts (`mobile:*`) from `apps/web/package.json`
    - Remove `react-native-web` alias from `next.config.mjs` and `@workspace/mobile-ui` dependency
    - Remove Capacitor-specific API URL resolution logic from `apps/web/lib/api-url.ts`
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

- [ ] 23. Final checkpoint — Full integration verification
  - Ensure all tests pass (`bun run test`), run `bun run typecheck` and `bun run lint`
  - Verify `apps/web` still builds and functions correctly after Capacitor removal
  - Verify `apps/native` compiles for both iOS and Android
  - Ask the user if questions arise

## Notes

- The native app uses **Expo SDK 55** (React Native 0.83, React 19.2, Expo Router v55)
- SDK 55 key differences from earlier SDKs:
  - Legacy Architecture is removed; New Architecture is the only option
  - Metro auto-configures for monorepos — no manual `watchFolders`/`nodeModulesPaths` needed
  - All Expo SDK packages use the same major version as the SDK (e.g., `expo-crypto@~55.0.0`)
  - `expo-router` follows SDK versioning (`~55.0.x` instead of `~5.0.x` or `~6.0.x`)
  - `jest@~29.7.0` and `eslint-config-expo@~55.0.0` are the compatible versions
  - `react-native-reanimated` v4 and `react-native-worklets` are required
  - Entry point is `"main": "expo-router/entry"` in package.json (no separate index.js)
- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate the 16 correctness properties defined in the design document
- Shared package extraction (tasks 1–4) is done first so both web and native apps benefit immediately
- The web app is updated alongside each extraction to ensure nothing breaks
- Capacitor/Ionic removal (task 22.2) is last to ensure the native app has full feature parity first
