import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSharedCalendarData } from '@workspace/ui/components/calendar';

export default function SettingsScreen() {
  const { calendars, categories, eventsLoading, eventsError } = useSharedCalendarData();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Calendar setup</Text>
      <Text style={styles.subtitle}>Mobile now uses shared calendar packages.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status</Text>
        <Text style={styles.row}>Calendars: {calendars.length}</Text>
        <Text style={styles.row}>Categories: {categories.length}</Text>
        <Text style={styles.row}>Sync: {eventsLoading ? 'Loading' : 'Ready'}</Text>
        {!!eventsError && <Text style={styles.error}>{eventsError.message}</Text>}
      </View>
    </ScrollView>
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
  error: { fontSize: 13, color: '#dc2626', marginTop: 6 },
});
