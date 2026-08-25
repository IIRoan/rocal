import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { createLogger } from "@workspace/logger";
import { authClient } from "../../src/lib/auth-client";
import { APP_BASE_URL } from "../../src/lib/constants";
import { useAuth } from "../../src/providers/AuthProvider";
import { AUTH_SIGN_UP_ROUTE } from "../../src/lib/auth-routing";
import { resolvePasskeyAutoPromptAction } from "../../src/lib/passkey-step-up-prompt";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";
import { ThemeToggle } from "../../src/components/ThemeToggle";
import type { ThemeTokens } from "@workspace/design-tokens";

const log = createLogger("auth:sign-in");

function validateEmail(value: string): string | null {
  if (!value.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return "Please enter a valid email address";
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return "Password is required";
  return null;
}

function resolvePasswordResetRedirectUrl(): string | null {
  if (!APP_BASE_URL) {
    return null;
  }

  try {
    return new URL("/reset-password", APP_BASE_URL).toString();
  } catch {
    return `${APP_BASE_URL.replace(/\/+$/, "")}/reset-password`;
  }
}

export default function SignInScreen() {
  const { signIn, requiresPasskeyStepUp, completePasskeyStepUp } = useAuth();
  const { toast } = useToast();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isResetMode, setIsResetMode] = useState(false);

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRequestingPasswordReset, setIsRequestingPasswordReset] =
    useState(false);
  const [isVerifyingPasskey, setIsVerifyingPasskey] = useState(false);
  const hasStartedPasskeyPromptRef = useRef(false);

  const passwordRef = useRef<TextInput>(null);

  const clearErrors = useCallback(() => {
    setEmailError(null);
    setPasswordError(null);
    setServerError(null);
  }, []);

  const handleSignIn = useCallback(async () => {
    clearErrors();

    const eErr = validateEmail(email);
    const pErr = validatePassword(password);

    if (eErr) setEmailError(eErr);
    if (pErr) setPasswordError(pErr);
    if (eErr || pErr) {
      log.warn("Sign-in validation failed", {
        emailError: eErr,
        passwordError: pErr,
      });
      return;
    }

    log.info("Attempting email sign-in", { email: email.trim() });
    setIsSigningIn(true);
    try {
      const result = await signIn(email.trim(), password);
      log.ok("Sign-in successful");
      if (result.requiresPasskeyStepUp) {
        setServerError(
          "Password accepted, but passkeys are unavailable on this device. Sign in from a device that can verify your passkey.",
        );
      }
    } catch (err: any) {
      const message =
        err?.message ?? "Sign-in failed. Please check your credentials.";
      log.error("Sign-in failed", err);
      setServerError(message);
    } finally {
      setIsSigningIn(false);
    }
  }, [clearErrors, email, password, signIn]);

  const handleRequestPasswordReset = useCallback(async () => {
    clearErrors();

    const eErr = validateEmail(email);
    if (eErr) {
      setEmailError(eErr);
      return;
    }

    const redirectTo = resolvePasswordResetRedirectUrl();
    if (!redirectTo) {
      setServerError(
        "Password reset is unavailable because the public app URL is not configured.",
      );
      return;
    }

    log.info("Requesting password reset", { email: email.trim() });
    setIsRequestingPasswordReset(true);

    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo,
      });

      if (result?.error) {
        throw new Error(
          result.error.message ?? "Unable to send a password reset link.",
        );
      }

      Alert.alert(
        "Check your email",
        "If an account exists for that email, Solace sent a password reset link for your email sign-in password.",
      );
      toast("Password reset link sent");
      setIsResetMode(false);
    } catch (err: any) {
      const message =
        err?.message ?? "Unable to send a password reset link right now.";
      log.error("Password reset request failed", err);
      setServerError(message);
    } finally {
      setIsRequestingPasswordReset(false);
    }
  }, [clearErrors, email, toast]);

  const handleVerifyPasskey = useCallback(async () => {
    hasStartedPasskeyPromptRef.current = true;
    clearErrors();
    setIsVerifyingPasskey(true);
    try {
      await completePasskeyStepUp();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Passkey verification failed. Please try again.";
      log.error("Passkey verification failed", err);
      setServerError(message);
    } finally {
      setIsVerifyingPasskey(false);
    }
  }, [clearErrors, completePasskeyStepUp]);

  useEffect(() => {
    const action = resolvePasskeyAutoPromptAction({
      requiresPasskeyStepUp,
      isPasswordSignInInFlight: isSigningIn,
      hasStartedPrompt: hasStartedPasskeyPromptRef.current,
    });

    if (action === "skip") {
      return;
    }

    hasStartedPasskeyPromptRef.current = true;
    if (action === "prompt") {
      void handleVerifyPasskey();
    }
  }, [handleVerifyPasskey, isSigningIn, requiresPasskeyStepUp]);

  const switchMode = useCallback(
    (nextMode: boolean) => {
      setIsResetMode(nextMode);
      clearErrors();

      if (nextMode) {
        setPassword("");
      }
    },
    [clearErrors],
  );

  const isLoading =
    isSigningIn || isRequestingPasswordReset || isVerifyingPasskey;

  const title = isResetMode
    ? "Reset your email sign-in password"
    : requiresPasskeyStepUp
      ? "Verify your passkey"
      : "Welcome back";
  const subtitle = isResetMode
    ? "Enter your email and Solace will send a web link to reset your email sign-in password."
    : requiresPasskeyStepUp
      ? "This device still needs to verify a passkey registered on another device."
      : "Sign in with your email and password.";

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.topBar}>
          <ThemeToggle />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.appName}>Solace</Text>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            {serverError ? (
              <View style={styles.serverErrorContainer}>
                <Text style={styles.serverErrorText}>{serverError}</Text>
              </View>
            ) : null}

            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, emailError && styles.inputError]}
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.mutedForeground}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError(null);
                }}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType={isResetMode ? "done" : "next"}
                onSubmitEditing={() => {
                  if (isResetMode) {
                    void handleRequestPasswordReset();
                  } else {
                    passwordRef.current?.focus();
                  }
                }}
                editable={!isLoading}
                accessibilityLabel="Email address"
                accessibilityHint="Enter your email address"
              />
              {emailError ? (
                <Text style={styles.fieldError}>{emailError}</Text>
              ) : null}
            </View>

            {!isResetMode ? (
              <View style={styles.fieldContainer}>
                <View style={styles.inlineLabelRow}>
                  <Text style={styles.label}>Password</Text>
                  <Pressable
                    onPress={() => switchMode(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Forgot password"
                  >
                    <Text style={styles.inlineLink}>Forgot password?</Text>
                  </Pressable>
                </View>
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, passwordError && styles.inputError]}
                  placeholder="Enter your password"
                  placeholderTextColor={theme.colors.mutedForeground}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (passwordError) setPasswordError(null);
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  autoCorrect={false}
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleSignIn}
                  editable={!isLoading}
                  accessibilityLabel="Password"
                  accessibilityHint="Enter your password"
                />
                {passwordError ? (
                  <Text style={styles.fieldError}>{passwordError}</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.helperCard}>
                <Text style={styles.helperText}>
                  Solace will email you a secure link to reset your email sign-in
                  password on the web. If you sign in with email, Solace also
                  uses that password to protect your encryption keys after you
                  sign in.
                </Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                isLoading && styles.buttonDisabled,
              ]}
              onPress={isResetMode ? handleRequestPasswordReset : handleSignIn}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel={isResetMode ? "Send reset link" : "Sign in"}
              accessibilityState={{ disabled: isLoading }}
            >
              {isSigningIn || isRequestingPasswordReset ? (
                <ActivityIndicator color={theme.colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isResetMode ? "Send reset link" : "Sign in"}
                </Text>
              )}
            </Pressable>

            {requiresPasskeyStepUp && !isResetMode ? (
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                  isLoading && styles.buttonDisabled,
                ]}
                onPress={() => {
                  void handleVerifyPasskey();
                }}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel="Use passkey"
                accessibilityState={{ disabled: isLoading }}
              >
                {isVerifyingPasskey ? (
                  <ActivityIndicator color={theme.colors.foreground} />
                ) : (
                  <Text style={styles.secondaryButtonText}>Use passkey</Text>
                )}
              </Pressable>
            ) : null}

            <View style={styles.footer}>
              {isResetMode ? (
                <>
                  <Text style={styles.footerText}>Remembered it? </Text>
                  <Pressable
                    onPress={() => switchMode(false)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.footerLink}>Back to sign in</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.footerText}>
                    Don&apos;t have an account?{" "}
                  </Text>
                  <Link href={AUTH_SIGN_UP_ROUTE} asChild>
                    <Pressable accessibilityRole="link">
                      <Text style={styles.footerLink}>Sign up</Text>
                    </Pressable>
                  </Link>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    flex: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    topBar: {
      flexDirection: "row" as const,
      justifyContent: "flex-end" as const,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center" as const,
    },
    container: {
      paddingHorizontal: theme.spacing["6"],
      paddingVertical: theme.spacing["8"],
      maxWidth: 400,
      width: "100%" as const,
      alignSelf: "center" as const,
    },
    header: {
      alignItems: "center" as const,
      marginBottom: theme.spacing["8"],
    },
    serverErrorContainer: {
      backgroundColor: theme.colors.destructive + "18",
      borderWidth: 1,
      borderColor: theme.colors.destructive + "40",
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing["3"],
      marginBottom: theme.spacing["4"],
    },
    fieldContainer: {
      marginBottom: theme.spacing["4"],
    },
    inlineLabelRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      marginBottom: theme.spacing["1"],
    },
    helperCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.muted + "20",
      borderRadius: theme.borderRadius.lg,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
      marginBottom: theme.spacing["4"],
    },
    inputError: {
      borderColor: theme.colors.destructive,
    },
    primaryButton: {
      backgroundColor: theme.colors.primaryBase,
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing["3"],
      alignItems: "center" as const,
      justifyContent: "center" as const,
      minHeight: 48,
      marginTop: theme.spacing["2"],
    },
    primaryButtonPressed: {
      opacity: 0.85,
    },
    secondaryButton: {
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing["3"],
      alignItems: "center" as const,
      justifyContent: "center" as const,
      minHeight: 48,
      marginTop: theme.spacing["3"],
    },
    secondaryButtonPressed: {
      opacity: 0.85,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    footer: {
      flexDirection: "row" as const,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      marginTop: theme.spacing["6"],
      flexWrap: "wrap" as const,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    appName: {
      fontSize: theme.typography.fontSize["3xl"].size,
      lineHeight: theme.typography.fontSize["3xl"].lineHeight,
      fontWeight: theme.typography.fontWeight.bold as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
      marginBottom: theme.spacing["2"],
    },
    title: {
      fontSize: theme.typography.fontSize["2xl"].size,
      lineHeight: theme.typography.fontSize["2xl"].lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: theme.spacing["1"],
    },
    subtitle: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    serverErrorText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
      textAlign: "center" as const,
    },
    label: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: theme.spacing["1"],
    },
    inlineLink: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    },
    helperText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.input,
      borderRadius: theme.borderRadius.lg,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.background,
    },
    fieldError: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
      marginTop: theme.spacing["1"],
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    footerText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    footerLink: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
