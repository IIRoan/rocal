import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  createE2eeModule,
  hydrateEncryptedEventWithoutSession,
  ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
  type E2eeModule,
  type E2eeProvider as IE2eeProvider,
} from "@workspace/e2ee";
import type {
  CalendarEvent,
  CreateCalendarRequest,
  CreateCategoryRequest,
  CreateEventRequest,
  E2eeBootstrapResponse,
  UpdateCalendarRequest,
  UpdateCategoryRequest,
  UpdateEventRequest,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  createNativeCryptoProvider,
  installCryptoPolyfill,
} from "../lib/native-crypto-provider";
import { SECURE_STORE_KEYS } from "../lib/constants";
import { getAuthHeaders } from "../lib/api";
import { createLogger } from "@workspace/logger";
import { useAuth, type AuthMethod } from "./AuthProvider";
import { useTheme } from "./ThemeProvider";

const log = createLogger("native:e2ee");

interface E2eeSession {
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
  deviceId: string;
  userId: string;
  apiBaseUrl: string;
}

type GateMode = "setup" | "unlock" | "legacy";

interface E2eeGateState {
  mode: GateMode;
  userId: string;
  apiBaseUrl: string;
  authMethod: AuthMethod;
  passwordEnvelope: E2eeBootstrapResponse["passwordEnvelope"];
}

export interface E2eeContextValue {
  isReady: boolean;
  isEnabled: boolean;
  provider: IE2eeProvider;
  bootstrap: (userId: string, apiBaseUrl: string) => Promise<void>;
  resetEncryptionPassword: (password: string) => Promise<boolean>;
  clearSession: () => void;
}

const E2eeContext = createContext<E2eeContextValue | null>(null);

export function E2eeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const {
    clearPendingAuthPassword,
    consumePendingAuthPassword,
    lastAuthMethod,
    signOut,
  } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createGateStyles(theme), [theme]);

  const [isReady, setIsReady] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [gateState, setGateState] = useState<E2eeGateState | null>(null);
  const [gatePassword, setGatePassword] = useState("");
  const [gateConfirmPassword, setGateConfirmPassword] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [isGateSubmitting, setIsGateSubmitting] = useState(false);

  const sessionRef = useRef<E2eeSession | null>(null);
  const moduleRef = useRef<E2eeModule | null>(null);
  const bootstrapGenerationRef = useRef(0);

  const resetGate = useCallback(() => {
    setGateState(null);
    setGatePassword("");
    setGateConfirmPassword("");
    setGateError(null);
    setIsGateSubmitting(false);
  }, []);

  const getModule = useCallback(async (): Promise<E2eeModule | null> => {
    if (moduleRef.current) {
      return moduleRef.current;
    }

    await installCryptoPolyfill();

    const crypto = createNativeCryptoProvider();
    if (!crypto) {
      return null;
    }

    moduleRef.current = createE2eeModule(crypto);
    return moduleRef.current;
  }, []);

  const registerDeviceForSession = useCallback(
    async ({
      e2ee,
      userId,
      apiBaseUrl,
      accountKey,
      blindIndexKey,
    }: {
      e2ee: E2eeModule;
      userId: string;
      apiBaseUrl: string;
      accountKey: CryptoKey;
      blindIndexKey: CryptoKey;
    }): Promise<E2eeSession> => {
      const keyPair = await e2ee.generateWrappingKeyPair();
      const publicKey = await e2ee.exportWrappingPublicKey(keyPair.publicKey);
      const wrappedAccountKey = await e2ee.wrapSymmetricKey(
        accountKey,
        keyPair.publicKey,
      );
      const wrappedSearchKey = await e2ee.wrapSymmetricKey(
        blindIndexKey,
        keyPair.publicKey,
      );
      const deviceId = e2ee.generateDeviceId();

      const crypto = createNativeCryptoProvider();
      if (!crypto) {
        throw new Error("Native crypto is unavailable for E2EE device export.");
      }

      const exportedPrivateKey = await crypto.subtle.exportKey(
        "jwk",
        keyPair.privateKey,
      );

      const deviceResponse = await fetch(`${apiBaseUrl}/e2ee/device`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          deviceId,
          publicKey,
          wrappedAccountKey,
          wrappedSearchKey,
        }),
      });

      if (!deviceResponse.ok) {
        throw new Error(
          `E2EE device registration returned ${deviceResponse.status}.`,
        );
      }

      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.E2EE_DEVICE_ID,
        deviceId,
      );
      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.E2EE_PRIVATE_KEY,
        JSON.stringify(exportedPrivateKey),
      );

      return {
        accountKey,
        blindIndexKey,
        deviceId,
        userId,
        apiBaseUrl,
      };
    },
    [],
  );

  const storePasswordEnvelopeForActiveSession = useCallback(
    async ({
      e2ee,
      userId,
      apiBaseUrl,
      password,
    }: {
      e2ee: E2eeModule;
      userId: string;
      apiBaseUrl: string;
      password: string;
    }) => {
      const session = sessionRef.current;

      if (!session) {
        throw new Error("E2EE session is not ready on this device.");
      }

      const envelope = await e2ee.createPasswordEnvelope(
        session.accountKey,
        session.blindIndexKey,
        password,
      );

      const response = await fetch(`${apiBaseUrl}/e2ee/password`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(envelope),
      });

      if (!response.ok) {
        throw new Error(
          `E2EE password registration returned ${response.status}.`,
        );
      }

      clearPendingAuthPassword();
      log.info("Stored native E2EE password envelope for active session", {
        userId,
      });
    },
    [clearPendingAuthPassword],
  );

  const bootstrap = useCallback(
    async (userId: string, apiBaseUrl: string) => {
      const generation = bootstrapGenerationRef.current + 1;
      bootstrapGenerationRef.current = generation;
      const isCurrentBootstrap = () =>
        bootstrapGenerationRef.current === generation;

      sessionRef.current = null;
      resetGate();
      setIsEnabled(false);
      setIsReady(false);

      try {
        const e2ee = await getModule();

        if (!e2ee) {
          log.warn(
            "E2EE is unavailable in the current runtime. Encryption is disabled for this session.",
          );
          if (isCurrentBootstrap()) {
            setIsReady(true);
          }
          return;
        }

        const response = await fetch(`${apiBaseUrl}/e2ee/bootstrap`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          log.warn("E2EE bootstrap endpoint returned", response.status);
          if (isCurrentBootstrap()) {
            setIsReady(true);
          }
          return;
        }

        const bootstrapData = (await response.json()) as E2eeBootstrapResponse;

        if (!bootstrapData.enabled) {
          log.info("E2EE is not enabled for this user");
          if (isCurrentBootstrap()) {
            setIsReady(true);
          }
          return;
        }

        if (!isCurrentBootstrap()) {
          return;
        }

        setIsEnabled(true);

        const deviceId = await SecureStore.getItemAsync(
          SECURE_STORE_KEYS.E2EE_DEVICE_ID,
        );
        const privateKeyJwk = await SecureStore.getItemAsync(
          SECURE_STORE_KEYS.E2EE_PRIVATE_KEY,
        );

        const existingDevice = bootstrapData.devices.find(
          (device) => device.deviceId === deviceId,
        );

        if (existingDevice && privateKeyJwk) {
          const crypto = createNativeCryptoProvider();
          if (!crypto) {
            throw new Error("Native crypto is unavailable for E2EE unwrap.");
          }

          const privateKey = await crypto.subtle.importKey(
            "jwk",
            JSON.parse(privateKeyJwk),
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["unwrapKey"],
          );

          const accountKey = await e2ee.unwrapAccountKey(
            existingDevice.wrappedAccountKey,
            privateKey,
          );
          const blindIndexKey = await e2ee.unwrapBlindIndexKey(
            existingDevice.wrappedSearchKey,
            privateKey,
          );

          if (!isCurrentBootstrap()) {
            return;
          }

          sessionRef.current = {
            accountKey,
            blindIndexKey,
            deviceId: existingDevice.deviceId,
            userId,
            apiBaseUrl,
          };
          clearPendingAuthPassword();
          log.info("Restored native E2EE session from existing device", {
            userId,
            deviceId: existingDevice.deviceId,
          });
          return;
        }

        const pendingPassword = consumePendingAuthPassword();
        const authMethod = lastAuthMethod;

        if (bootstrapData.passwordEnvelope) {
          if (pendingPassword) {
            try {
              const { accountKey, blindIndexKey } =
                await e2ee.unwrapPasswordEnvelope(
                  pendingPassword,
                  bootstrapData.passwordEnvelope,
                );
              const nextSession = await registerDeviceForSession({
                e2ee,
                userId,
                apiBaseUrl,
                accountKey,
                blindIndexKey,
              });

              if (!isCurrentBootstrap()) {
                return;
              }

              sessionRef.current = nextSession;
              log.info("Unlocked native E2EE with pending auth password", {
                userId,
                deviceId: nextSession.deviceId,
              });
              return;
            } catch (error) {
              log.info(
                "Pending auth password did not unlock native E2EE envelope",
                {
                  userId,
                  error,
                },
              );
            }
          }

          if (!isCurrentBootstrap()) {
            return;
          }

          setGateState({
            mode: "unlock",
            userId,
            apiBaseUrl,
            authMethod,
            passwordEnvelope: bootstrapData.passwordEnvelope,
          });
          return;
        }

        if (bootstrapData.devices.length > 0) {
          if (!isCurrentBootstrap()) {
            return;
          }

          setGateState({
            mode: "legacy",
            userId,
            apiBaseUrl,
            authMethod,
            passwordEnvelope: null,
          });
          return;
        }

        const accountKey = await e2ee.generateAccountKey();
        const blindIndexKey = await e2ee.generateBlindIndexKey();
        const nextSession = await registerDeviceForSession({
          e2ee,
          userId,
          apiBaseUrl,
          accountKey,
          blindIndexKey,
        });

        if (!isCurrentBootstrap()) {
          return;
        }

        sessionRef.current = nextSession;

        if (pendingPassword) {
          try {
            await storePasswordEnvelopeForActiveSession({
              e2ee,
              userId,
              apiBaseUrl,
              password: pendingPassword,
            });
            return;
          } catch (error) {
            log.warn("Failed to auto-store native E2EE password envelope", {
              userId,
              error,
            });
          }
        }

        setGateState({
          mode: "setup",
          userId,
          apiBaseUrl,
          authMethod,
          passwordEnvelope: null,
        });
      } catch (error) {
        if (isCurrentBootstrap()) {
          log.error("E2EE bootstrap failed:", error);
        }
      } finally {
        if (isCurrentBootstrap()) {
          setIsReady(true);
        }
      }
    },
    [
      clearPendingAuthPassword,
      consumePendingAuthPassword,
      getModule,
      lastAuthMethod,
      registerDeviceForSession,
      resetGate,
      storePasswordEnvelopeForActiveSession,
    ],
  );

  const clearSession = useCallback(() => {
    bootstrapGenerationRef.current += 1;
    sessionRef.current = null;
    resetGate();
    setIsEnabled(false);
    setIsReady(false);
    clearPendingAuthPassword();
  }, [clearPendingAuthPassword, resetGate]);

  const resetEncryptionPassword = useCallback(
    async (password: string) => {
      const session = sessionRef.current;

      if (!session) {
        return false;
      }

      const e2ee = await getModule();
      if (!e2ee) {
        throw new Error("E2EE is unavailable in this runtime.");
      }

      await storePasswordEnvelopeForActiveSession({
        e2ee,
        userId: session.userId,
        apiBaseUrl: session.apiBaseUrl,
        password,
      });

      return true;
    },
    [getModule, storePasswordEnvelopeForActiveSession],
  );

  const handleGateSubmit = useCallback(async () => {
    if (!gateState || gateState.mode === "legacy") {
      return;
    }

    if (gateState.mode === "setup") {
      if (gatePassword.length < 8) {
        setGateError("Use at least 8 characters for your encryption password.");
        return;
      }

      if (gatePassword !== gateConfirmPassword) {
        setGateError("Passwords do not match.");
        return;
      }
    } else if (!gatePassword) {
      setGateError(
        gateState.authMethod === "email-password"
          ? "Enter your email sign-in password."
          : "Enter your encryption password.",
      );
      return;
    }

    setIsGateSubmitting(true);
    setGateError(null);

    try {
      const e2ee = await getModule();
      if (!e2ee) {
        throw new Error("E2EE is unavailable in this runtime.");
      }

      if (gateState.mode === "unlock") {
        if (!gateState.passwordEnvelope) {
          throw new Error("Missing E2EE password envelope.");
        }

        const { accountKey, blindIndexKey } = await e2ee.unwrapPasswordEnvelope(
          gatePassword,
          gateState.passwordEnvelope,
        );

        const nextSession = await registerDeviceForSession({
          e2ee,
          userId: gateState.userId,
          apiBaseUrl: gateState.apiBaseUrl,
          accountKey,
          blindIndexKey,
        });

        sessionRef.current = nextSession;
      } else {
        await storePasswordEnvelopeForActiveSession({
          e2ee,
          userId: gateState.userId,
          apiBaseUrl: gateState.apiBaseUrl,
          password: gatePassword,
        });
      }

      resetGate();
    } catch (error) {
      log.warn("Failed to complete native E2EE gate", {
        userId: gateState.userId,
        mode: gateState.mode,
        error,
      });
      setGateError(getGateErrorMessage(gateState));
    } finally {
      setIsGateSubmitting(false);
    }
  }, [
    gateConfirmPassword,
    gatePassword,
    gateState,
    getModule,
    registerDeviceForSession,
    resetGate,
    storePasswordEnvelopeForActiveSession,
  ]);

  const handleGateRetry = useCallback(() => {
    if (!gateState) {
      return;
    }

    void bootstrap(gateState.userId, gateState.apiBaseUrl);
  }, [bootstrap, gateState]);

  const handleGateSignOut = useCallback(async () => {
    setIsGateSubmitting(true);
    setGateError(null);

    try {
      await signOut();
    } finally {
      resetGate();
      setIsGateSubmitting(false);
    }
  }, [resetGate, signOut]);

  const provider = useMemo<IE2eeProvider>(() => {
    const getSession = (): E2eeSession | null => sessionRef.current;

    return {
      async attachEventEncryptionShadow<
        T extends CreateEventRequest | UpdateEventRequest,
      >(request: T): Promise<T> {
        const session = getSession();
        if (!session) {
          return request;
        }

        try {
          const e2ee = await getModule();
          if (!e2ee) {
            return request;
          }

          const payload = {
            title: (request as { title?: string }).title,
            description:
              (request as { description?: string | null }).description ?? null,
            location:
              (request as { location?: string | null }).location ?? null,
          };

          const encrypted = await e2ee.encryptJsonPayload(
            session.accountKey,
            payload,
            "event-content:v1",
          );

          const blindIndexTokens = (request as { title?: string }).title
            ? await e2ee.createBlindIndexTokens(
                session.blindIndexKey,
                (request as { title: string }).title,
              )
            : [];

          return {
            ...request,
            encryptedContent: JSON.stringify(encrypted),
            blindIndexTokens,
            encryptionState: "shadow_write",
            encryptionKeyVersion: 1,
          } as T;
        } catch (error) {
          log.error("Failed to encrypt event:", error);
          return request;
        }
      },

      async attachCalendarEncryptionShadow<
        T extends CreateCalendarRequest | UpdateCalendarRequest,
      >(request: T): Promise<T> {
        const session = getSession();
        if (!session) {
          return request;
        }

        try {
          const e2ee = await getModule();
          if (!e2ee) {
            return request;
          }

          const encrypted = await e2ee.encryptJsonPayload(
            session.accountKey,
            { name: (request as { name?: string }).name },
            "calendar-name:v1",
          );

          const blindIndexTokens = (request as { name?: string }).name
            ? await e2ee.createBlindIndexTokens(
                session.blindIndexKey,
                (request as { name: string }).name,
              )
            : [];

          return {
            ...request,
            encryptedName: JSON.stringify(encrypted),
            blindIndexTokens,
            encryptionState: "shadow_write",
            encryptionKeyVersion: 1,
          } as T;
        } catch (error) {
          log.error("Failed to encrypt calendar:", error);
          return request;
        }
      },

      async attachCategoryEncryptionShadow<
        T extends CreateCategoryRequest | UpdateCategoryRequest,
      >(request: T): Promise<T> {
        const session = getSession();
        if (!session) {
          return request;
        }

        try {
          const e2ee = await getModule();
          if (!e2ee) {
            return request;
          }

          const encrypted = await e2ee.encryptJsonPayload(
            session.accountKey,
            { name: (request as { name?: string }).name },
            "category-name:v1",
          );

          const blindIndexTokens = (request as { name?: string }).name
            ? await e2ee.createBlindIndexTokens(
                session.blindIndexKey,
                (request as { name: string }).name,
              )
            : [];

          return {
            ...request,
            encryptedName: JSON.stringify(encrypted),
            blindIndexTokens,
            encryptionState: "shadow_write",
            encryptionKeyVersion: 1,
          } as T;
        } catch (error) {
          log.error("Failed to encrypt category:", error);
          return request;
        }
      },

      async hydrateEncryptedEvent(
        event: CalendarEvent,
      ): Promise<CalendarEvent> {
        if (
          event.encryptionState !== "encrypted" ||
          !event.encryptedContent ||
          typeof event.encryptedContent !== "string"
        ) {
          return event;
        }

        const session = getSession();
        if (!session) {
          return hydrateEncryptedEventWithoutSession(event);
        }

        try {
          const e2ee = await getModule();
          if (!e2ee) {
            return hydrateEncryptedEventWithoutSession(event);
          }

          const payload = JSON.parse(event.encryptedContent);
          const decrypted = await e2ee.decryptJsonPayload<{
            title: string;
            description?: string | null;
            location?: string | null;
          }>(session.accountKey, payload, "event-content:v1");

          return {
            ...event,
            title:
              decrypted.title?.trim() ||
              event.title?.trim() ||
              ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
            description: decrypted.description ?? null,
            location: decrypted.location ?? null,
          };
        } catch {
          return hydrateEncryptedEventWithoutSession(event);
        }
      },

      async hydrateEncryptedEvents(
        events: CalendarEvent[],
      ): Promise<CalendarEvent[]> {
        return Promise.all(
          events.map((event) => provider.hydrateEncryptedEvent(event)),
        );
      },

      async createBlindIndexTokens(value: string): Promise<string[]> {
        const session = getSession();
        if (!session) {
          return [];
        }

        try {
          const e2ee = await getModule();
          if (!e2ee) {
            return [];
          }

          return e2ee.createBlindIndexTokens(session.blindIndexKey, value);
        } catch {
          return [];
        }
      },
    };
  }, [getModule]);

  const value = useMemo<E2eeContextValue>(
    () => ({
      isReady,
      isEnabled,
      provider,
      bootstrap,
      resetEncryptionPassword,
      clearSession,
    }),
    [
      bootstrap,
      clearSession,
      isEnabled,
      isReady,
      provider,
      resetEncryptionPassword,
    ],
  );

  const isUnlock = gateState?.mode === "unlock";
  const isLegacy = gateState?.mode === "legacy";
  const usesAccountPassword = gateState?.authMethod === "email-password";

  const title = isUnlock
    ? "Unlock encrypted data"
    : isLegacy
      ? "Finish encryption migration"
      : "Protect your encryption keys";

  const description = isUnlock
    ? usesAccountPassword
      ? "Solace normally reuses your email sign-in password to unlock encrypted data on this device. If that did not finish automatically, enter the same password here. If you recently changed it, use your previous password."
      : "Enter your encryption password to unlock encrypted data on this device."
    : isLegacy
      ? "This account still uses the older device-only key flow. Open a device that can already decrypt your data, sign in there, and save an encryption password once."
      : usesAccountPassword
        ? "Solace normally reuses your email sign-in password to protect your encryption keys. Re-enter it here only if automatic setup did not finish."
        : "Choose an encryption password to protect your end-to-end encryption keys for recovery and legacy device flows.";

  const passwordLabel = isUnlock
    ? usesAccountPassword
      ? "Email sign-in password"
      : "Encryption password"
    : usesAccountPassword
      ? "Email sign-in password"
      : "Encryption password";

  const primaryLabel = isGateSubmitting
    ? "Working..."
    : isUnlock
      ? "Unlock"
      : isLegacy
        ? "Retry"
        : usesAccountPassword
          ? "Continue"
          : "Save password";

  return (
    <E2eeContext.Provider value={value}>
      {children}

      {gateState ? (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => undefined}
        >
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.modalContainer}
            >
              <View style={styles.modalCard}>
                <View style={styles.header}>
                  <Text style={styles.title}>{title}</Text>
                </View>

                <View style={styles.body}>
                  <Text style={styles.description}>{description}</Text>

                  {!isLegacy ? (
                    <>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.label}>{passwordLabel}</Text>
                        <TextInput
                          value={gatePassword}
                          onChangeText={setGatePassword}
                          secureTextEntry
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoFocus
                          editable={!isGateSubmitting}
                          style={[
                            styles.input,
                            gateError ? styles.inputError : undefined,
                          ]}
                          textContentType={
                            isUnlock ? "password" : "newPassword"
                          }
                          autoComplete={isUnlock ? "password" : "new-password"}
                        />
                      </View>

                      {gateState.mode === "setup" ? (
                        <View style={styles.fieldGroup}>
                          <Text style={styles.label}>Confirm password</Text>
                          <TextInput
                            value={gateConfirmPassword}
                            onChangeText={setGateConfirmPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!isGateSubmitting}
                            style={[
                              styles.input,
                              gateError ? styles.inputError : undefined,
                            ]}
                            textContentType="newPassword"
                            autoComplete="new-password"
                          />
                        </View>
                      ) : null}
                    </>
                  ) : null}

                  {gateError ? (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>{gateError}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.footer}>
                  <Pressable
                    onPress={handleGateSignOut}
                    disabled={isGateSubmitting}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && !isGateSubmitting && styles.secondaryPressed,
                      isGateSubmitting && styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Sign out</Text>
                  </Pressable>

                  <Pressable
                    onPress={isLegacy ? handleGateRetry : handleGateSubmit}
                    disabled={isGateSubmitting}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && !isGateSubmitting && styles.primaryPressed,
                      isGateSubmitting && styles.buttonDisabled,
                    ]}
                  >
                    {isGateSubmitting ? (
                      <ActivityIndicator
                        color={theme.colors.primaryForeground}
                      />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {primaryLabel}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      ) : null}
    </E2eeContext.Provider>
  );
}

function getGateErrorMessage(gateState: E2eeGateState): string {
  if (gateState.mode === "unlock") {
    return gateState.authMethod === "email-password"
      ? "That password did not match. If you recently changed your email sign-in password, use the previous one here."
      : "That password did not unlock your encrypted data.";
  }

  return "Could not save your encryption password. Try again.";
}

function createGateStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(15, 23, 42, 0.5)",
      justifyContent: "center",
      paddingHorizontal: theme.spacing["4"],
    },
    modalContainer: {
      width: "100%",
    },
    modalCard: {
      borderRadius: theme.borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      overflow: "hidden",
    },
    header: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    title: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    body: {
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["4"],
    },
    description: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    fieldGroup: {
      gap: theme.spacing["2"],
    },
    label: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    input: {
      minHeight: 48,
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.input ?? theme.colors.card,
      color: theme.colors.foreground,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
    },
    inputError: {
      borderColor: theme.colors.destructive,
    },
    errorContainer: {
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${theme.colors.destructive}55`,
      backgroundColor: `${theme.colors.destructive}18`,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2.5"] ?? 10,
    },
    errorText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
    },
    footer: {
      flexDirection: "row",
      gap: theme.spacing["2"],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
    },
    secondaryButton: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    } satisfies ViewStyle,
    secondaryPressed: {
      backgroundColor: theme.colors.accent,
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    primaryButton: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.primaryBase,
    } satisfies ViewStyle,
    primaryPressed: {
      opacity: 0.9,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.primaryForeground,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    buttonDisabled: {
      opacity: 0.6,
    },
  });
}

export function useE2ee(): E2eeContextValue {
  const ctx = useContext(E2eeContext);
  if (!ctx) {
    throw new Error("useE2ee must be used within an E2eeProvider");
  }
  return ctx;
}
