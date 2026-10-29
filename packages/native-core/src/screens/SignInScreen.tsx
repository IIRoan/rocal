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
import { FORGOT_PASSWORD_NOTICE } from "@workspace/calendar-core/product-info";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { AUTH_SIGN_UP_ROUTE } from "@workspace/native-core/lib/auth-routing";
import { resolvePasskeyAutoPromptAction } from "@workspace/native-core/lib/passkey-step-up-prompt";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { ThemeToggle } from "@workspace/native-core/components/ThemeToggle";
import { AppInformationLinks } from "@workspace/native-core/components/AppInformationLinks";
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

type SignInErrors = {
  email: string | null;
  password: string | null;
  server: string | null;
};

const NO_ERRORS: SignInErrors = { email: null, password: null, server: null };

export function SignInScreen() {
  const { signIn, requiresPasskeyStepUp, completePasskeyStepUp, signInNotice } =
    useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<SignInErrors>(NO_ERRORS);
  const [pending, setPending] = useState<"sign-in" | "passkey" | null>(null);
  const hasStartedPasskeyPromptRef = useRef(false);
  const signInInFlightRef = useRef(false);

  const passwordRef = useRef<TextInput>(null);

  const handleSignIn = useCallback(async () => {
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);

    setErrors({ email: eErr, password: pErr, server: null });
    if (eErr || pErr) {
      log.warn("Sign-in validation failed", {
        emailError: eErr,
        passwordError: pErr,
      });
      return;
    }

    log.info("Attempting email sign-in", { email: email.trim() });
    setPending("sign-in");
    signInInFlightRef.current = true;
    try {
      const result = await signIn(email.trim(), password);
      log.ok("Sign-in successful");
      if (result.requiresPasskeyStepUp) {
        setErrors({
          ...NO_ERRORS,
          server:
            "Password accepted, but passkeys are unavailable on this device. Sign in from a device that can verify your passkey.",
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Sign-in failed. Please check your credentials.";
      log.error("Sign-in failed", err);
      setErrors({ ...NO_ERRORS, server: message });
    } finally {
      signInInFlightRef.current = false;
      setPending(null);
    }
  }, [email, password, signIn]);

  const handleVerifyPasskey = useCallback(async () => {
    hasStartedPasskeyPromptRef.current = true;
    setErrors(NO_ERRORS);
    setPending("passkey");
    try {
      await completePasskeyStepUp();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Passkey verification failed. Please try again.";
      log.error("Passkey verification failed", err);
      setErrors({ ...NO_ERRORS, server: message });
    } finally {
      setPending(null);
    }
  }, [completePasskeyStepUp]);

  // The step-up flag comes from the auth provider; a password sign-in on this screen handles its own step-up.
  useEffect(() => {
    const action = resolvePasskeyAutoPromptAction({
      requiresPasskeyStepUp,
      isPasswordSignInInFlight: signInInFlightRef.current,
      hasStartedPrompt: hasStartedPasskeyPromptRef.current,
    });

    if (action === "skip") {
      return;
    }

    hasStartedPasskeyPromptRef.current = true;
    if (action === "prompt") {
      handleVerifyPasskey().catch(() => undefined);
    }
  }, [handleVerifyPasskey, requiresPasskeyStepUp]);

  const isLoading = pending !== null;
  const serverError = errors.server ?? signInNotice;

  const title = requiresPasskeyStepUp ? "Verify your passkey" : "Welcome back";
  const subtitle = requiresPasskeyStepUp
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
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.mutedForeground}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.email) setErrors({ ...errors, email: null });
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
              {errors.email ? (
                <Text style={styles.fieldError}>{errors.email}</Text>
              ) : null}
            </View>

            <View style={styles.fieldContainer}>
              <View style={styles.inlineLabelRow}>
                <Text style={styles.label}>Password</Text>
                <Pressable
                  onPress={() =>
                    Alert.alert("Forgot your password?", FORGOT_PASSWORD_NOTICE)
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password"
                >
                  <Text style={styles.inlineLink}>Forgot password?</Text>
                </Pressable>
              </View>
              <TextInput
                ref={passwordRef}
                style={[styles.input, errors.password && styles.inputError]}
                placeholder="Enter your password"
                placeholderTextColor={theme.colors.mutedForeground}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password) setErrors({ ...errors, password: null });
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
              {errors.password ? (
                <Text style={styles.fieldError}>{errors.password}</Text>
              ) : null}
            </View>

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
              {pending === "sign-in" ? (
                <ActivityIndicator color={theme.colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryButtonText}>Sign in</Text>
              )}
            </Pressable>

            {requiresPasskeyStepUp ? (
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                  isLoading && styles.buttonDisabled,
                ]}
                onPress={() => {
                  handleVerifyPasskey().catch(() => undefined);
                }}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel="Use passkey"
                accessibilityState={{ disabled: isLoading }}
              >
                {pending === "passkey" ? (
                  <ActivityIndicator color={theme.colors.foreground} />
                ) : (
                  <Text style={styles.secondaryButtonText}>Use passkey</Text>
                )}
              </Pressable>
            ) : null}

            <View style={styles.footer}>
              <Text style={styles.footerText}>Don&apos;t have an account? </Text>
              <Link href={AUTH_SIGN_UP_ROUTE} asChild>
                <Pressable accessibilityRole="link">
                  <Text style={styles.footerLink}>Sign up</Text>
                </Pressable>
              </Link>
            </View>
            <AppInformationLinks />
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
