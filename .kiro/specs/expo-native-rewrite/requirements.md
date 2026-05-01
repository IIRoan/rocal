# Requirements Document

## Introduction

This document defines the requirements for building a new native mobile application (`apps/native`) using Expo and React Native to replace the previous webview-based mobile experience in the Solace calendar monorepo. The native app communicates with the same Elysia.js backend API and replicates all existing calendar features with true native performance. Styling uses React Native's built-in `StyleSheet.create()` API with a custom Theme_Provider (React Context) for design token access and light/dark mode support. Shared business logic (API client, hooks, types, date utilities) is extracted into workspace packages consumable by both the web and native apps. The existing Next.js web app remains unchanged.

## Glossary

- **Native_App**: The new Expo React Native application located at `apps/native`, targeting iOS and Android with native rendering (no WebView).
- **Web_App**: The existing Next.js frontend at `apps/web` that remains unchanged.
- **Backend_API**: The existing Elysia.js API server at `apps/backend` providing all calendar, auth, and settings endpoints.
- **Expo_Router**: The file-based routing system for React Native provided by Expo Router.
- **Theme_Provider**: A custom React Context provider in the Native_App that supplies design tokens (colors, spacing, typography) from the Design_Token_Package and the active color scheme (light or dark) to all components via a `useTheme` hook.
- **Design_Token_Package**: A shared workspace package (`packages/design-tokens`) that defines colors, spacing, typography, and other visual tokens consumed by both the Tailwind theme (web) and the Theme_Provider (native).
- **Shared_API_Client**: A platform-agnostic HTTP client and API service package (`packages/calendar-client`) extracted from the existing `apps/web/lib/` code, consumable by both web and native apps.
- **Shared_Hooks_Package**: A shared workspace package (`packages/calendar-core`) containing platform-agnostic React hooks, date utilities, validation logic, and TypeScript types.
- **E2EE_Module**: The end-to-end encryption system using AES-GCM-256 for event content and RSA-OAEP for key wrapping, currently in `apps/web/lib/e2ee-*.ts`.
- **Better_Auth_Client**: The authentication client library (`better-auth`) used for session management, sign-in, sign-up, and passkey authentication.
- **Push_Notification_Service**: The native push notification system (Expo Notifications / APNs / FCM) replacing browser notifications.
- **Gesture_Handler**: React Native Gesture Handler library providing native gesture recognition for drag-and-drop and swipe interactions.
- **Calendar_View**: One of the calendar display modes: month, week, day, three-day, or agenda.

## Requirements

### Requirement 1: Expo Project Scaffolding

**User Story:** As a developer, I want a properly configured Expo project in the monorepo, so that I can build and run the native app alongside the existing web and backend apps.

#### Acceptance Criteria

1. THE Native_App SHALL be located at `apps/native` within the existing Bun workspace monorepo.
2. THE Native_App SHALL use the latest stable Expo SDK with Expo Router for file-based navigation.
3. THE Native_App SHALL target both iOS and Android platforms using a single codebase.
4. THE Native_App SHALL integrate with the existing monorepo workspace resolution so that shared packages (`packages/*`) are importable without publishing.
5. THE Native_App SHALL include development scripts (`dev`, `build:ios`, `build:android`, `lint`, `typecheck`, `test`) in its `package.json`.
6. WHEN the monorepo root `bun run dev` command is executed, THE Native_App SHALL be startable independently via `bun run dev:native` without interfering with the Web_App or Backend_API dev processes.
7. THE Native_App SHALL use React 19 to match the Web_App React version.

### Requirement 2: StyleSheet Styling System

**User Story:** As a developer, I want a styling system using React Native's built-in `StyleSheet.create()` API with a theme context, so that the app has predictable native rendering performance with no third-party styling dependencies.

#### Acceptance Criteria

1. THE Native_App SHALL use React Native's built-in `StyleSheet.create()` API as its sole styling mechanism for all native UI components.
2. THE Theme_Provider SHALL supply light and dark theme objects derived from the Design_Token_Package to all components via React Context.
3. WHEN the device system appearance changes, THE Theme_Provider SHALL detect the change using React Native's `useColorScheme()` hook (or `Appearance` API) and update the active theme accordingly.
4. THE Native_App SHALL define all component styles using `StyleSheet.create()` with token values accessed from the Theme_Provider via a `useTheme` hook.
5. THE Native_App SHALL support responsive layout adjustments for tablet and phone form factors using React Native's `Dimensions` API or `useWindowDimensions` hook.
6. THE Native_App SHALL NOT use NativeWind, Tailwind CSS, Unistyles, Tamagui, or any third-party CSS-to-RN translation layer.

### Requirement 3: Shared Design Tokens

**User Story:** As a designer, I want consistent visual tokens across web and native, so that the brand identity is maintained on all platforms.

#### Acceptance Criteria

1. THE Design_Token_Package SHALL define color palettes, spacing scales, typography scales, border radii, and shadow definitions in a platform-agnostic TypeScript format.
2. THE Web_App SHALL consume design tokens to generate its Tailwind CSS v4 theme configuration.
3. THE Native_App SHALL consume design tokens to construct its Theme_Provider light and dark theme objects.
4. WHEN a design token value is updated in the Design_Token_Package, THE Web_App and Native_App SHALL both reflect the change after rebuilding.
5. THE Design_Token_Package SHALL define the calendar color palette (blue, orange, violet, rose, emerald, red, cyan, lime, amber, indigo, pink, teal) used for calendars, events, and categories.

### Requirement 4: Shared Business Logic Extraction

**User Story:** As a developer, I want shared business logic in workspace packages, so that the web and native apps stay in sync without code duplication.

#### Acceptance Criteria

1. THE Shared_API_Client SHALL provide a platform-agnostic HTTP client with retry logic, timeout handling, and error transformation compatible with both web `fetch` and React Native `fetch`.
2. THE Shared_API_Client SHALL provide typed API service methods for all Backend_API endpoints: events, calendars, categories, settings, recurring events, subscriptions, notifications, calendar sharing, and bulk operations.
3. THE Shared_Hooks_Package SHALL provide platform-agnostic React hooks for calendar data loading, event form state management, settings management, and event search.
4. THE Shared_Hooks_Package SHALL provide date utility functions (using `date-fns`) for calendar computations, timezone handling, and recurrence logic.
5. THE Shared_Hooks_Package SHALL provide all TypeScript type definitions and interfaces currently in `apps/web/lib/types/calendar.ts`.
6. THE Shared_API_Client SHALL accept a configurable base URL so that the Web_App and Native_App can each provide their own API endpoint.
7. WHEN the Backend_API contract changes, THE Shared_API_Client SHALL be the single location requiring updates, and both apps SHALL receive the change through the workspace dependency.

### Requirement 5: Authentication

**User Story:** As a user, I want to sign in to the native app securely, so that I can access my calendars and events.

#### Acceptance Criteria

1. THE Native_App SHALL authenticate against the Backend_API using the Better_Auth_Client with session-based cookie authentication.
2. THE Native_App SHALL provide email/password sign-in and sign-up flows.
3. THE Native_App SHALL support passkey authentication using platform biometrics (Face ID, Touch ID, Android biometrics) via the Better Auth passkey plugin.
4. WHEN a user session expires, THE Native_App SHALL redirect the user to the sign-in screen and clear local session state.
5. THE Native_App SHALL persist authentication tokens securely using platform-specific secure storage (iOS Keychain, Android Keystore).
6. IF the Backend_API returns a 401 or 403 status code, THEN THE Native_App SHALL terminate the current session and prompt re-authentication.
7. THE Native_App SHALL configure the Backend_API CORS and cookie settings to accept requests from the native app origin.

### Requirement 6: Calendar Views

**User Story:** As a user, I want to view my calendar in multiple layouts, so that I can see my schedule at different levels of detail.

#### Acceptance Criteria

1. THE Native_App SHALL provide a month view displaying a grid of days with event indicators (dots or compact event bars).
2. THE Native_App SHALL provide a week view displaying 7 columns with time slots and positioned event blocks.
3. THE Native_App SHALL provide a day view displaying a single day with time slots and positioned event blocks.
4. THE Native_App SHALL provide a three-day view displaying 3 consecutive days with time slots and positioned event blocks.
5. THE Native_App SHALL provide an agenda view displaying a chronological scrollable list of upcoming events.
6. WHEN the user swipes horizontally on a Calendar_View, THE Native_App SHALL navigate to the next or previous time period for that view.
7. THE Native_App SHALL render calendar views using native React Native components and the Gesture_Handler for smooth 60fps scrolling and gesture interactions.
8. THE Native_App SHALL respect the user's configured week start day (Sunday or Monday) from their settings.
9. THE Native_App SHALL display events from all visible calendars with their assigned calendar or event colors.
10. WHILE the Native_App is loading calendar data, THE Native_App SHALL display skeleton placeholder UI matching the active Calendar_View layout.

### Requirement 7: Event Management

**User Story:** As a user, I want to create, view, edit, and delete events on my phone, so that I can manage my schedule on the go.

#### Acceptance Criteria

1. WHEN the user taps a time slot or uses the create action, THE Native_App SHALL present an event creation form with fields for title, date/time, calendar, category, location, description, color, all-day toggle, recurrence, and reminders.
2. WHEN the user taps an existing event, THE Native_App SHALL present the event details with options to edit or delete.
3. THE Native_App SHALL validate event data before submission: title is required, end time is after start time, title does not exceed 255 characters, description does not exceed 1000 characters.
4. WHEN the user saves an event, THE Native_App SHALL send the request to the Backend_API via the Shared_API_Client and update the local calendar view upon success.
5. WHEN the user deletes an event, THE Native_App SHALL confirm the deletion and send the request to the Backend_API.
6. THE Native_App SHALL support editing and deleting recurring events with scope options: this occurrence, this and future occurrences, or all occurrences.
7. THE Native_App SHALL support recurrence rules (daily, weekly, monthly, yearly) with preview of upcoming occurrences.
8. IF the Backend_API returns a validation error during event creation or update, THEN THE Native_App SHALL display the error messages inline on the form.

### Requirement 8: Calendar Management

**User Story:** As a user, I want to manage multiple calendars with different colors, so that I can organize events by context.

#### Acceptance Criteria

1. THE Native_App SHALL display a list of the user's calendars with name, color, and visibility toggle.
2. WHEN the user creates a new calendar, THE Native_App SHALL present a form with name and color selection fields.
3. WHEN the user edits a calendar, THE Native_App SHALL allow changing the name, color, and visibility.
4. WHEN the user deletes a calendar, THE Native_App SHALL offer options to delete all events, move events to another calendar, or cancel.
5. THE Native_App SHALL support the calendar color palette defined in the Design_Token_Package.
6. THE Native_App SHALL support calendar sharing via ICS share links, allowing the user to enable, view, and disable share links for their calendars.

### Requirement 9: Category Management

**User Story:** As a user, I want to categorize my events, so that I can filter and organize them by type.

#### Acceptance Criteria

1. THE Native_App SHALL display a list of the user's event categories with name, color, and active status.
2. WHEN the user creates a new category, THE Native_App SHALL present a form with name and color selection fields.
3. WHEN the user edits a category, THE Native_App SHALL allow changing the name, color, and active status.
4. WHEN the user deletes a category, THE Native_App SHALL confirm the deletion and remove the category assignment from associated events.
5. THE Native_App SHALL allow assigning a category to an event during event creation or editing.

### Requirement 10: Push Notifications

**User Story:** As a user, I want to receive push notifications for upcoming events, so that I don't miss appointments when the app is in the background.

#### Acceptance Criteria

1. THE Native_App SHALL request push notification permissions from the user on first launch or when notifications are enabled in settings.
2. WHEN a push notification permission is granted, THE Native_App SHALL register the device push token with the Backend_API.
3. THE Push_Notification_Service SHALL deliver event reminders at the configured minutes-before time for each event notification.
4. WHEN the user taps a push notification, THE Native_App SHALL navigate to the corresponding event detail screen.
5. THE Native_App SHALL support configuring multiple reminder times per event (matching the existing web notification system).
6. IF push notification permission is denied, THEN THE Native_App SHALL display a message in settings explaining how to enable notifications in device settings.
7. THE Native_App SHALL use Expo Notifications for local scheduling and remote push delivery via APNs (iOS) and FCM (Android).

### Requirement 11: End-to-End Encryption

**User Story:** As a user, I want my event data encrypted on my device before it reaches the server, so that my calendar data remains private.

#### Acceptance Criteria

1. THE Native_App SHALL implement the same E2EE scheme as the Web_App: AES-GCM-256 for content encryption, RSA-OAEP-4096 for key wrapping, HMAC-SHA-256 for blind index tokens.
2. THE Native_App SHALL encrypt event title, description, and location fields before sending them to the Backend_API.
3. THE Native_App SHALL decrypt encrypted event content received from the Backend_API for display.
4. THE Native_App SHALL support device-based encryption key enrollment, storing the device key pair in platform secure storage (iOS Keychain, Android Keystore).
5. THE Native_App SHALL support password-based encryption key recovery using PBKDF2-SHA-256 key derivation.
6. WHEN the E2EE session is not available and encrypted events are received, THE Native_App SHALL display a placeholder title ("Encrypted event") and omit description and location.
7. THE E2EE_Module SHALL be extracted into a shared package or use a platform-agnostic crypto abstraction so that both the Web_App (using Web Crypto API) and Native_App (using `expo-crypto` or `react-native-quick-crypto`) share the same encryption logic.

### Requirement 12: Settings

**User Story:** As a user, I want to configure my calendar preferences on the native app, so that the app behaves according to my needs.

#### Acceptance Criteria

1. THE Native_App SHALL provide a settings screen with sections for display preferences, time and timezone, working hours, notification preferences, default event settings, and UI preferences.
2. THE Native_App SHALL support theme selection (light, dark, system) and apply the selected theme via the Theme_Provider.
3. THE Native_App SHALL support configuring: default calendar view, week start day, timezone, time format (12h/24h), working hours start/end, working days.
4. THE Native_App SHALL support configuring: default reminder time, default event duration, default calendar, compact view, show week numbers, show declined events.
5. WHEN the user updates a setting, THE Native_App SHALL persist the change to the Backend_API via the Shared_API_Client and update the local UI immediately (optimistic update).
6. THE Native_App SHALL load user settings from the Backend_API on app launch and cache them locally for offline access.

### Requirement 13: Calendar Subscriptions

**User Story:** As a user, I want to subscribe to external ICS calendar feeds, so that I can see external events alongside my own.

#### Acceptance Criteria

1. THE Native_App SHALL display a list of the user's calendar subscriptions with name, URL, sync status, and last sync time.
2. WHEN the user adds a subscription, THE Native_App SHALL present a form with name and ICS feed URL fields.
3. WHEN the user triggers a manual sync, THE Native_App SHALL send a sync request to the Backend_API and display the sync result (events added, updated, deleted).
4. THE Native_App SHALL support editing subscription name and active status.
5. WHEN the user deletes a subscription, THE Native_App SHALL offer the option to also delete synced events.
6. THE Native_App SHALL support importing ICS files from the device file system.

### Requirement 14: Gesture-Based Interactions

**User Story:** As a user, I want to interact with my calendar using native gestures, so that the app feels natural on my phone.

#### Acceptance Criteria

1. THE Native_App SHALL support drag-and-drop event rescheduling on day, week, and three-day views using the Gesture_Handler.
2. WHEN the user long-presses an event and drags it to a new time slot, THE Native_App SHALL update the event start and end times accordingly.
3. WHEN the user long-presses an event and drags it to a new day column (in week or three-day view), THE Native_App SHALL update the event date accordingly.
4. THE Native_App SHALL provide haptic feedback (via Expo Haptics) when initiating a drag, hovering over a valid drop target, and completing a drop.
5. THE Native_App SHALL support swipe-to-delete on event list items in the agenda view with a confirmation step.
6. THE Native_App SHALL support pull-to-refresh on calendar views to reload event data from the Backend_API.

### Requirement 15: Search and Command Palette

**User Story:** As a user, I want to search for events quickly, so that I can find specific events without scrolling through my calendar.

#### Acceptance Criteria

1. THE Native_App SHALL provide a search interface accessible from the main navigation.
2. WHEN the user enters a search query, THE Native_App SHALL search events via the Backend_API search endpoint with support for blind index tokens (for encrypted events).
3. THE Native_App SHALL display search results as a scrollable list with event title, date, time, calendar name, and category.
4. WHEN the user taps a search result, THE Native_App SHALL navigate to the event detail screen.
5. THE Native_App SHALL debounce search input to avoid excessive API calls, with a delay of 300 milliseconds.

### Requirement 16: Offline Support and Data Caching

**User Story:** As a user, I want the app to work when I have poor connectivity, so that I can still view my recent calendar data.

#### Acceptance Criteria

1. THE Native_App SHALL cache the most recently fetched calendar data (events, calendars, categories, settings) locally using React Query persistence or equivalent.
2. WHILE the device has no network connectivity, THE Native_App SHALL display cached calendar data with a visual indicator that the data may be stale.
3. WHEN network connectivity is restored, THE Native_App SHALL automatically re-fetch and reconcile calendar data with the Backend_API.
4. IF a write operation (create, update, delete) fails due to network unavailability, THEN THE Native_App SHALL display an error message and allow the user to retry.

### Requirement 17: Navigation Structure

**User Story:** As a user, I want intuitive navigation, so that I can move between calendar views, settings, and other screens efficiently.

#### Acceptance Criteria

1. THE Native_App SHALL use Expo_Router for file-based navigation with a tab-based main layout.
2. THE Native_App SHALL provide bottom tab navigation with tabs for: Calendar, Search, and Settings.
3. WHEN the user taps the Calendar tab, THE Native_App SHALL display the user's configured default Calendar_View.
4. THE Native_App SHALL support stack-based navigation within each tab for drill-down screens (event detail, event editor, calendar management, category management, subscription management).
5. THE Native_App SHALL support deep linking so that push notification taps and external links navigate to the correct screen.

### Requirement 18: Legacy Mobile Stack Removal

**User Story:** As a developer, I want to remove the legacy mobile-webview dependencies from the web app once the native app is ready, so that the codebase is clean and maintainable.

#### Acceptance Criteria

1. WHEN the Native_App reaches feature parity with the existing mobile experience, THE Web_App SHALL remove all remaining legacy mobile-webview dependencies from web and shared packages.
2. WHEN the Native_App reaches feature parity, THE Web_App SHALL remove obsolete mobile wrapper config files and generated native platform directories from `apps/web/`.
3. WHEN the legacy stack is removed, THE Web_App SHALL remove all mobile-specific scripts (`mobile:*`) from its `package.json`.
5. THE Web_App SHALL remove the `react-native-web` alias from `next.config.mjs` and the `@workspace/mobile-ui` dependency after the native app is live.
6. THE Web_App SHALL remove the legacy mobile-wrapper API URL resolution logic from `apps/web/lib/api-url.ts`.
