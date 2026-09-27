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
import { Link, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { createLogger } from "@workspace/logger";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { AUTH_SIGN_IN_ROUTE } from "@workspace/native-core/lib/auth-routing";
import {
  accountApiService,
  inviteApiService,
} from "@workspace/native-core/lib/api";
import {
  INVITE_REQUIRED_MESSAGE,
  claimSignupInvite,
  describeInviteValidation,
  readInviteTokenParam,
} from "@workspace/native-core/lib/invite-signup";
import {
  useInviteTokenValidation,
  useSignupDomain,
} from "@workspace/native-core/hooks/use-signup";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { ThemeToggle } from "@workspace/native-core/components/ThemeToggle";
import type { ThemeTokens } from "@workspace/design-tokens";

const log = createLogger("auth:sign-up");

function validateName(name: string): string | null {
  if (!name.trim()) return "Name is required";
  if (name.trim().length < 2) return "Name must be at least 2 characters";
  return null;
}

function validateDesiredEmail(email: string): string | null {
  if (!email.trim()) return "Solace email is required";
  if (
    !/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(email.trim().toLowerCase())
  ) {
    return "Use lowercase letters, numbers, dots, underscores, or hyphens";
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}

export function SignUpScreen() {
  const { signUp } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const signupDomain = useSignupDomain();
  const { invite } = useLocalSearchParams<{ invite?: string | string[] }>();
  const inviteParam = readInviteTokenParam(invite);

  const [name, setName] = useState("");
  const [desiredEmail, setDesiredEmail] = useState("");
  const [inviteToken, setInviteToken] = useState(inviteParam);
  const [password, setPassword] = useState("");
  const [lastInviteParam, setLastInviteParam] = useState(inviteParam);

  // A new invite deep link can arrive while this screen stays mounted.
  if (inviteParam !== lastInviteParam) {
    setLastInviteParam(inviteParam);
    if (inviteParam) setInviteToken(inviteParam);
  }

  const inviteValidation = useInviteTokenValidation(inviteToken);

  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const inviteRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const clearErrors = useCallback(() => {
    setNameError(null);
    setEmailError(null);
    setInviteError(null);
    setPasswordError(null);
    setServerError(null);
  }, []);

  const handleSignUp = useCallback(async () => {
    clearErrors();

    const trimmedName = name.trim();
    const normalizedDesiredEmail = desiredEmail.trim().toLowerCase();

    const nErr = validateName(name);
    const eErr = validateDesiredEmail(desiredEmail);
    const iErr = inviteToken.trim()
      ? inviteValidation.status === "invalid"
        ? inviteValidation.reason
        : null
      : INVITE_REQUIRED_MESSAGE;
    const pErr = validatePassword(password);

    if (nErr) setNameError(nErr);
    if (eErr) setEmailError(eErr);
    if (iErr) setInviteError(iErr);
    if (pErr) setPasswordError(pErr);
    if (nErr || eErr || iErr || pErr) {
      log.warn("Sign-up validation failed", {
        nameError: nErr,
        emailError: eErr,
        inviteError: iErr,
        passwordError: pErr,
      });
      return;
    }

    log.info("Attempting sign-up");
    setIsSubmitting(true);
    try {
      const availability = await accountApiService.checkEmailAvailability(
        normalizedDesiredEmail,
      );

      if (!availability.available) {
        setEmailError(availability.message);
        return;
      }

      const claim = await claimSignupInvite(
        inviteApiService,
        inviteToken,
        availability.normalizedEmail,
      );
      if (!claim.ok) {
        setInviteError(claim.error);
        return;
      }

      await signUp(trimmedName, availability.normalizedEmail, password);
      log.ok("Sign-up successful");
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Sign-up failed. Please try again.";
      log.error("Sign-up failed", err);
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    clearErrors,
    desiredEmail,
    inviteToken,
    inviteValidation,
    name,
    password,
    signUp,
  ]);

  const inviteMessage = inviteError ?? describeInviteValidation(inviteValidation);
  const inviteMessageStyle =
    inviteError || inviteValidation.status === "invalid"
      ? styles.fieldError
      : inviteValidation.status === "valid"
        ? styles.fieldSuccess
        : styles.fieldHint;

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
              <Text style={styles.title}>Create your account</Text>
              <Text style={styles.subtitle}>
                Choose your @{signupDomain} Solace email and password. Your
                Solace email becomes your account address, and this password
                also protects your encrypted data.
              </Text>
            </View>

            {/* Server error */}
            {serverError && (
              <View style={styles.serverErrorContainer}>
                <Text style={styles.serverErrorText}>{serverError}</Text>
              </View>
            )}

            {/* Name field */}
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={[styles.input, nameError && styles.inputError]}
                placeholder="Your name"
                placeholderTextColor={theme.colors.mutedForeground}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (nameError) setNameError(null);
                }}
                autoCapitalize="words"
                autoComplete="name"
                autoCorrect={false}
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!isSubmitting}
                accessibilityLabel="Full name"
                accessibilityHint="Enter your full name"
              />
              {nameError && <Text style={styles.fieldError}>{nameError}</Text>}
            </View>

            {/* Solace email field */}
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Solace email</Text>
              <View
                style={[
                  styles.inputWithSuffix,
                  emailError && styles.inputError,
                ]}
              >
                <TextInput
                  ref={emailRef}
                  style={styles.inputInner}
                  placeholder="your-name"
                  placeholderTextColor={theme.colors.mutedForeground}
                  value={desiredEmail}
                  onChangeText={(text) => {
                    setDesiredEmail(text);
                    if (emailError) setEmailError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => inviteRef.current?.focus()}
                  editable={!isSubmitting}
                  accessibilityLabel="Solace email"
                  accessibilityHint={`Choose the name before @${signupDomain}`}
                />
                <Text style={styles.inputSuffix}>@{signupDomain}</Text>
              </View>
              {emailError && (
                <Text style={styles.fieldError}>{emailError}</Text>
              )}
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Invite token</Text>
              <View
                style={[
                  styles.inputWithSuffix,
                  (inviteError || inviteValidation.status === "invalid") &&
                    styles.inputError,
                ]}
              >
                <TextInput
                  ref={inviteRef}
                  style={styles.inputInner}
                  placeholder="Paste your invite token"
                  placeholderTextColor={theme.colors.mutedForeground}
                  value={inviteToken}
                  onChangeText={(text) => {
                    setInviteToken(text);
                    if (inviteError) setInviteError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!isSubmitting}
                  accessibilityLabel="Invite token"
                  accessibilityHint="Paste the invite token shared with you"
                />
                <View style={styles.inputStatusIcon}>
                  {inviteValidation.status === "checking" ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.mutedForeground}
                    />
                  ) : inviteValidation.status === "valid" ? (
                    <Feather
                      name="check"
                      size={16}
                      color={theme.colors.primaryBase}
                    />
                  ) : inviteValidation.status === "invalid" ? (
                    <Feather
                      name="x"
                      size={16}
                      color={theme.colors.destructive}
                    />
                  ) : (
                    <Feather
                      name="user-plus"
                      size={16}
                      color={theme.colors.mutedForeground}
                    />
                  )}
                </View>
              </View>
              <Text style={inviteMessageStyle}>{inviteMessage}</Text>
            </View>

            {/* Password field */}
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                ref={passwordRef}
                style={[styles.input, passwordError && styles.inputError]}
                placeholder="At least 8 characters"
                placeholderTextColor={theme.colors.mutedForeground}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError(null);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
                editable={!isSubmitting}
                accessibilityLabel="Password"
                accessibilityHint="Create a password with at least 8 characters"
              />
              {passwordError && (
                <Text style={styles.fieldError}>{passwordError}</Text>
              )}
            </View>

            {/* Sign up button */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={handleSignUp}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Create account"
              accessibilityState={{ disabled: isSubmitting }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={theme.colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryButtonText}>Create account</Text>
              )}
            </Pressable>

            {/* Footer link */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href={AUTH_SIGN_IN_ROUTE} asChild>
                <Pressable accessibilityRole="link">
                  <Text style={styles.footerLink}>Sign in</Text>
                </Pressable>
              </Link>
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
    inputWithSuffix: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: theme.colors.input,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.background,
      overflow: "hidden" as const,
    },
    inputError: {
      borderColor: theme.colors.destructive,
    },
    inputStatusIcon: {
      width: 44,
      alignItems: "center" as const,
      justifyContent: "center" as const,
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
    buttonDisabled: {
      opacity: 0.6,
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
    inputInner: {
      flex: 1,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.background,
    },
    inputSuffix: {
      borderLeftWidth: 1,
      borderLeftColor: theme.colors.input,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      backgroundColor: theme.colors.background,
    },
    fieldError: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
      marginTop: theme.spacing["1"],
    },
    fieldHint: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: theme.spacing["1"],
    },
    fieldSuccess: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.primaryBase,
      marginTop: theme.spacing["1"],
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
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
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
