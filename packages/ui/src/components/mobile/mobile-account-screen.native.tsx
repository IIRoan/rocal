import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface MobileAccountScreenProps {
  userName?: string | null;
  userEmail?: string | null;
  calendarsCount: number;
  categoriesCount: number;
  eventsLoading?: boolean;
  eventsError?: string | null;
  signingOut?: boolean;
  onSignOut?: () => void;
}

export function MobileAccountScreen({
  userName,
  userEmail,
  calendarsCount,
  categoriesCount,
  eventsLoading = false,
  eventsError = null,
  signingOut = false,
  onSignOut,
}: MobileAccountScreenProps) {
  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Workspace</Text>
          <Text style={styles.heroTitle}>Account</Text>
          <Text style={styles.heroSubtitle}>
            Shared mobile settings and account status from the UI package.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Signed in as</Text>
          <Text style={styles.cardTitle}>{userName || "Unknown user"}</Text>
          <Text style={styles.cardBody}>{userEmail || "No email on account"}</Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.card, styles.metricCard]}>
            <Text style={styles.metricValue}>{calendarsCount}</Text>
            <Text style={styles.metricLabel}>Calendars</Text>
          </View>
          <View style={[styles.card, styles.metricCard]}>
            <Text style={styles.metricValue}>{categoriesCount}</Text>
            <Text style={styles.metricLabel}>Categories</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Sync status</Text>
          <Text style={styles.cardTitle}>{eventsLoading ? "Loading" : "Ready"}</Text>
          <Text style={styles.cardBody}>
            {eventsLoading
              ? "The mobile app is refreshing shared calendar data."
              : "Shared calendar data is available in the mobile app."}
          </Text>
          {eventsError ? <Text style={styles.error}>{eventsError}</Text> : null}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={signingOut}
          onPress={onSignOut}
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && !signingOut ? styles.signOutButtonPressed : null,
            signingOut ? styles.signOutButtonDisabled : null,
          ]}
        >
          {signingOut ? (
            <ActivityIndicator color="#f8fafc" />
          ) : (
            <Text style={styles.signOutButtonText}>Sign out</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f7fb",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  hero: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 6,
  },
  heroEyebrow: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0f172a",
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    padding: 16,
    gap: 6,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    alignItems: "flex-start",
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0f172a",
  },
  metricLabel: {
    fontSize: 13,
    color: "#64748b",
  },
  error: {
    marginTop: 8,
    fontSize: 13,
    color: "#dc2626",
  },
  signOutButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 52,
    marginTop: 4,
  },
  signOutButtonPressed: {
    opacity: 0.9,
  },
  signOutButtonDisabled: {
    opacity: 0.7,
  },
  signOutButtonText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
});
