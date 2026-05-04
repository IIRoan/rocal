import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { createLogger } from "@workspace/logger";
import { useAuth } from "../../src/providers/AuthProvider";
import {
  isPasskeyBridgeOriginSecure,
  resolvePasskeyBridgeBaseUrl,
} from "../../src/lib/passkey-browser-bridge";
import {
  AUTH_SIGN_UP_ROUTE,
  CALENDAR_HOME_ROUTE,
} from "../../src/lib/auth-routing";
import { getAuthCapabilities } from "../../src/lib/auth-capabilities";
import { useTheme } from "../../src/providers/ThemeProvider";
import { ThemeToggle } from "../../src/components/ThemeToggle";
import type { ThemeTokens } from "@workspace/design-tokens";

const log = createLogger("auth:sign-in");

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SignInScreen() {
  const { signIn, signInWithGitHub, signInWithPasskey } = useAuth();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const authCapabilities = useMemo(
    () => {
      const passkeyBridgeBaseUrl = resolvePasskeyBridgeBaseUrl();

      return getAuthCapabilities({
        platformOs: Platform.OS,
        expoExecutionEnvironment: Constants.executionEnvironment,
        expoAppOwnership: Constants.appOwnership,
        hasPublicKeyCredential:
          typeof globalThis.PublicKeyCredential === "function",
        hasSecurePasskeyBridgeOrigin:
          isPasskeyBridgeOriginSecure(passkeyBridgeBaseUrl),
      });
    },
    [],
  );
  const showPasskeyButton = authCapabilities.supportsPasskeys;

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Validation state
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Loading state
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

  // Refs for focus management
  const passwordRef = useRef<TextInput>(null);

  // ── Handlers ───────────────────────────────────────────────────────

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
      log.warn("Sign-in validation failed", { emailError: eErr, passwordError: pErr });
      return;
    }

    log.info("Attempting email sign-in", { email: email.trim() });
    setIsSigningIn(true);
    try {
      await signIn(email.trim(), password);
      log.ok("Sign-in successful");
      router.replace(CALENDAR_HOME_ROUTE);
    } catch (err: any) {
      const message = err?.message ?? "Sign-in failed. Please check your credentials.";
      log.error("Sign-in failed", err);
      setServerError(message);
    } finally {
      setIsSigningIn(false);
    }
  }, [clearErrors, email, password, router, signIn]);

  const handlePasskeySignIn = useCallback(async () => {
    clearErrors();
    log.info("Attempting passkey sign-in");
    setIsPasskeyLoading(true);
    try {
      await signInWithPasskey();
      log.ok("Passkey sign-in successful");
      router.replace(CALENDAR_HOME_ROUTE);
    } catch (err: any) {
      const message = err?.message ?? "Passkey sign-in failed. Please try again.";
      log.error("Passkey sign-in failed", err);
      setServerError(message);
    } finally {
      setIsPasskeyLoading(false);
    }
  }, [clearErrors, router, signInWithPasskey]);

  const handleGitHubSignIn = useCallback(async () => {
    clearErrors();
    log.info("Attempting GitHub sign-in");
    setIsGitHubLoading(true);
    try {
      await signInWithGitHub();
      log.ok("GitHub sign-in successful");
      router.replace(CALENDAR_HOME_ROUTE);
    } catch (err: any) {
      const message = err?.message ?? "GitHub sign-in failed. Please try again.";
      log.error("GitHub sign-in failed", err);
      setServerError(message);
    } finally {
      setIsGitHubLoading(false);
    }
  }, [clearErrors, router, signInWithGitHub]);

  const isLoading = isSigningIn || isGitHubLoading || isPasskeyLoading;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Theme toggle — top right */}
        <View style={styles.topBar}>
          <ThemeToggle />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.appName}>Solace</Text>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>
                Sign in to your account to continue
              </Text>
            </View>

            {/* Server error */}
            {serverError && (
              <View style={styles.serverErrorContainer}>
                <Text style={styles.serverErrorText}>{serverError}</Text>
              </View>
            )}

            {/* Email field */}
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
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!isLoading}
                accessibilityLabel="Email address"
                accessibilityHint="Enter your email address"
              />
              {emailError && (
                <Text style={styles.fieldError}>{emailError}</Text>
              )}
            </View>

            {/* Password field */}
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Password</Text>
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
              {passwordError && (
                <Text style={styles.fieldError}>{passwordError}</Text>
              )}
            </View>

            {/* Sign in button */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                isLoading && styles.buttonDisabled,
              ]}
              onPress={handleSignIn}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: isLoading }}
            >
              {isSigningIn ? (
                <ActivityIndicator color={theme.colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryButtonText}>Sign in</Text>
              )}
            </Pressable>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialButtonsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.socialButton,
                  pressed && styles.secondaryButtonPressed,
                  isLoading && styles.buttonDisabled,
                ]}
                onPress={handleGitHubSignIn}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel="Continue with GitHub"
                accessibilityState={{ disabled: isLoading }}
              >
                {isGitHubLoading ? (
                  <ActivityIndicator color={theme.colors.foreground} />
                ) : (
                  <>
                    <Feather
                      name="github"
                      size={16}
                      color={theme.colors.foreground}
                    />
                    <Text style={styles.secondaryButtonText}>GitHub</Text>
                  </>
                )}
              </Pressable>

              {showPasskeyButton ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.socialButton,
                    pressed && styles.secondaryButtonPressed,
                    isLoading && styles.buttonDisabled,
                  ]}
                  onPress={handlePasskeySignIn}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with passkey"
                  accessibilityState={{ disabled: isLoading }}
                >
                  {isPasskeyLoading ? (
                    <ActivityIndicator color={theme.colors.foreground} />
                  ) : (
                    <>
                      <Feather
                        name="key"
                        size={16}
                        color={theme.colors.foreground}
                      />
                      <Text style={styles.secondaryButtonText}>Passkey</Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>

            {/* Footer link */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <Link href={AUTH_SIGN_UP_ROUTE} asChild>
                <Pressable accessibilityRole="link">
                  <Text style={styles.footerLink}>Sign up</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    divider: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginVertical: theme.spacing["5"],
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.colors.border,
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing["3"],
      alignItems: "center" as const,
      justifyContent: "center" as const,
      minHeight: 48,
      backgroundColor: theme.colors.background,
    },
    socialButtonsRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["3"],
    },
    socialButton: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing["3"],
      minHeight: 48,
      backgroundColor: theme.colors.background,
    },
    secondaryButtonPressed: {
      backgroundColor: theme.colors.accent,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    footer: {
      flexDirection: "row" as const,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      marginTop: theme.spacing["6"],
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
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
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
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    dividerText: {
      marginHorizontal: theme.spacing["3"],
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
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
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
