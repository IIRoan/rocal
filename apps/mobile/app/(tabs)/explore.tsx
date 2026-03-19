import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { useSharedCalendarData } from '@workspace/ui/components/calendar';
import { authClient } from '@/lib/auth-client';

export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const { calendars, categories, eventsLoading, eventsError } = useSharedCalendarData();
  const { data: session } = authClient.useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await authClient.signOut();
      queryClient.clear();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.subtitle}>Better Auth session state is active in the Expo app.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Signed in as</Text>
          <Text style={styles.row}>{session?.user.name || 'Unknown user'}</Text>
          <Text style={styles.mutedRow}>{session?.user.email || 'No email on account'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calendar sync</Text>
          <Text style={styles.row}>Calendars: {calendars.length}</Text>
          <Text style={styles.row}>Categories: {categories.length}</Text>
          <Text style={styles.row}>Sync: {eventsLoading ? 'Loading' : 'Ready'}</Text>
          {!!eventsError && <Text style={styles.error}>{eventsError.message}</Text>}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={handleSignOut}
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && !isSigningOut ? styles.signOutButtonPressed : null,
            isSigningOut ? styles.signOutButtonDisabled : null,
          ]}>
          {isSigningOut ? (
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
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginBottom: 4 },
  row: { fontSize: 14, color: '#334155' },
  mutedRow: { fontSize: 14, color: '#64748b' },
  error: { fontSize: 13, color: '#dc2626', marginTop: 6 },
  signOutButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
  },
  signOutButtonPressed: {
    opacity: 0.9,
  },
  signOutButtonDisabled: {
    opacity: 0.7,
  },
  signOutButtonText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
});
