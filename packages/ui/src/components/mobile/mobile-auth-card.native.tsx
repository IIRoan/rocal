import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface MobileAuthCardProps {
  appName?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  loading?: boolean;
  error?: string | null;
  footer?: string;
  onSubmit?: () => void;
}

export function MobileAuthCard({
  appName = "Rocani Mobile",
  title = "Sign in",
  subtitle = "Continue with GitHub. Password sign-in is disabled on mobile.",
  ctaLabel = "Continue with GitHub",
  loading = false,
  error = null,
  footer = "Your account is created automatically the first time you sign in with GitHub.",
  onSubmit,
}: MobileAuthCardProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.shell}>
          <View style={styles.accentOrb} />
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.eyebrow}>{appName}</Text>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            <View style={styles.form}>
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={onSubmit}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && !loading ? styles.primaryButtonPressed : null,
                  loading ? styles.primaryButtonDisabled : null,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#f8fafc" />
                ) : (
                  <Text style={styles.primaryButtonText}>{ctaLabel}</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{footer}</Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f7fb",
  },
  keyboardView: {
    flex: 1,
  },
  shell: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f4f7fb",
  },
  accentOrb: {
    position: "absolute",
    top: 88,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "#dbeafe",
    opacity: 0.7,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    padding: 24,
    gap: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    color: "#0f172a",
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
  },
  form: {
    gap: 12,
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 54,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
