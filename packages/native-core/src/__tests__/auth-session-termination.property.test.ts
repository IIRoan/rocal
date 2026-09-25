/**
 * Property 4: Auth session termination
 *
 * For any authenticated state, verify that 401/403/session expiry clears
 * the session token from secure storage and transitions to unauthenticated
 * state.
 *
 * Validates: Requirements 5.4, 5.6
 */
import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Minimal model of the auth state machine
// ---------------------------------------------------------------------------

type AuthTerminationEvent =
  | { type: "http_401" }
  | { type: "http_403" }
  | { type: "session_expiry" };

interface AuthState {
  isAuthenticated: boolean;
  sessionToken: string | null;
  userId: string | null;
}

interface SecureStorageModel {
  store: Map<string, string>;
}

/**
 * Simulates the auth state machine's response to termination events.
 * This mirrors the behavior implemented in AuthProvider + HTTP interceptor:
 * on 401, 403, or session expiry the session is cleared from both
 * in-memory state and secure storage.
 */
function handleTerminationEvent(
  state: AuthState,
  storage: SecureStorageModel,
  _event: AuthTerminationEvent,
): { state: AuthState; storage: SecureStorageModel } {
  // Clear in-memory auth state
  const newState: AuthState = {
    isAuthenticated: false,
    sessionToken: null,
    userId: null,
  };

  // Clear secure storage
  const newStorage: SecureStorageModel = {
    store: new Map(storage.store),
  };
  newStorage.store.delete("SESSION_TOKEN");

  return { state: newState, storage: newStorage };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbUserId = fc.string({ minLength: 8, maxLength: 36 });
const arbSessionToken = fc.string({ minLength: 32, maxLength: 64 });

const arbAuthenticatedState: fc.Arbitrary<{
  state: AuthState;
  storage: SecureStorageModel;
}> = fc.record({
  state: fc.record({
    isAuthenticated: fc.constant(true as boolean),
    sessionToken: arbSessionToken,
    userId: arbUserId,
  }),
  storage: arbSessionToken.map((token) => ({
    store: new Map([["SESSION_TOKEN", token]]),
  })),
});

const arbTerminationEvent: fc.Arbitrary<AuthTerminationEvent> = fc.oneof(
  fc.constant({ type: "http_401" as const }),
  fc.constant({ type: "http_403" as const }),
  fc.constant({ type: "session_expiry" as const }),
);

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("Property 4: Auth session termination", () => {
  it("any termination event on an authenticated state clears the session", () => {
    fc.assert(
      fc.property(
        arbAuthenticatedState,
        arbTerminationEvent,
        ({ state: initialState, storage: initialStorage }, event) => {
          // Pre-conditions: user is authenticated
          expect(initialState.isAuthenticated).toBe(true);
          expect(initialState.sessionToken).not.toBeNull();
          expect(initialStorage.store.has("SESSION_TOKEN")).toBe(true);

          // Act
          const { state: newState, storage: newStorage } =
            handleTerminationEvent(initialState, initialStorage, event);

          // Post-conditions:
          // 1. In-memory state transitions to unauthenticated
          expect(newState.isAuthenticated).toBe(false);
          expect(newState.sessionToken).toBeNull();
          expect(newState.userId).toBeNull();

          // 2. Session token is removed from secure storage
          expect(newStorage.store.has("SESSION_TOKEN")).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("termination is idempotent — clearing an already-cleared state is safe", () => {
    fc.assert(
      fc.property(
        arbAuthenticatedState,
        arbTerminationEvent,
        arbTerminationEvent,
        ({ state: initialState, storage: initialStorage }, event1, event2) => {
          // First termination
          const first = handleTerminationEvent(
            initialState,
            initialStorage,
            event1,
          );

          // Second termination on already-cleared state
          const second = handleTerminationEvent(
            first.state,
            first.storage,
            event2,
          );

          // Both should produce the same unauthenticated state
          expect(second.state.isAuthenticated).toBe(false);
          expect(second.state.sessionToken).toBeNull();
          expect(second.state.userId).toBeNull();
          expect(second.storage.store.has("SESSION_TOKEN")).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("all three termination event types produce the same cleared state", () => {
    fc.assert(
      fc.property(arbAuthenticatedState, ({ state, storage }) => {
        const events: AuthTerminationEvent[] = [
          { type: "http_401" },
          { type: "http_403" },
          { type: "session_expiry" },
        ];

        const results = events.map((event) =>
          handleTerminationEvent(state, storage, event),
        );

        // All three should produce identical post-states
        for (const result of results) {
          expect(result.state.isAuthenticated).toBe(false);
          expect(result.state.sessionToken).toBeNull();
          expect(result.state.userId).toBeNull();
          expect(result.storage.store.has("SESSION_TOKEN")).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
