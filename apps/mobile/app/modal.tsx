import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createLogger } from '@workspace/logger';
import { useSharedCalendarData } from '@workspace/ui/components/calendar';

const logger = createLogger('mobile:event-drawer');

type ModalParams = {
  mode?: string | string[];
  eventId?: string | string[];
  calendarId?: string | string[];
  start?: string | string[];
  end?: string | string[];
};

type DrawerPalette = {
  backdrop: string;
  sheetBg: string;
  border: string;
  text: string;
  mutedText: string;
  inputBg: string;
  inputBorder: string;
  accent: string;
  accentText: string;
  danger: string;
  chipBg: string;
  chipSelectedBg: string;
  chipSelectedBorder: string;
};

function firstParam(value?: string | string[]) {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function parseMaybeDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

function formatDateTime(value: Date) {
  return value.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPalette(isDark: boolean): DrawerPalette {
  if (isDark) {
    return {
      backdrop: 'rgba(0, 0, 0, 0.62)',
      sheetBg: '#111114',
      border: '#27272A',
      text: '#FAFAFA',
      mutedText: '#A1A1AA',
      inputBg: '#18181B',
      inputBorder: '#303036',
      accent: '#3B82F6',
      accentText: '#FFFFFF',
      danger: '#DC2626',
      chipBg: '#1E1E22',
      chipSelectedBg: '#1E3A8A33',
      chipSelectedBorder: '#3B82F6',
    };
  }

  return {
    backdrop: 'rgba(0, 0, 0, 0.4)',
    sheetBg: '#FFFFFF',
    border: '#E4E4E7',
    text: '#111827',
    mutedText: '#71717A',
    inputBg: '#FAFAFA',
    inputBorder: '#E4E4E7',
    accent: '#2563EB',
    accentText: '#FFFFFF',
    danger: '#DC2626',
    chipBg: '#F4F4F5',
    chipSelectedBg: '#DBEAFE',
    chipSelectedBorder: '#2563EB',
  };
}

export default function EventDrawerScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = useMemo(() => getPalette(isDark), [isDark]);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const params = useLocalSearchParams<ModalParams>();
  const modalMode = firstParam(params.mode) === 'edit' ? 'edit' : 'create';
  const eventId = firstParam(params.eventId);
  const startParam = firstParam(params.start);
  const endParam = firstParam(params.end);
  const calendarIdParam = firstParam(params.calendarId);

  const calendarData = useSharedCalendarData();
  const existingEvent = useMemo(
    () => (eventId ? calendarData.events.find((event) => event.id === eventId) : undefined),
    [calendarData.events, eventId],
  );
  const defaultCalendarId =
    calendarData.calendars.find((calendar) => calendar.isDefault)?.id ||
    calendarData.calendars[0]?.id ||
    '';

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [startTime, setStartTime] = useState<Date>(() => parseMaybeDate(startParam) ?? new Date());
  const [endTime, setEndTime] = useState<Date>(() => parseMaybeDate(endParam) ?? addMinutes(new Date(), 60));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setupKey = `${modalMode}|${eventId ?? ''}|${startParam ?? ''}|${endParam ?? ''}|${calendarIdParam ?? ''}`;
  const hydratedKeyRef = useRef<string | null>(null);
  const hydratedEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    logger.info('Event drawer opened', {
      mode: modalMode,
      eventId: eventId ?? null,
      hasStart: Boolean(startParam),
      hasEnd: Boolean(endParam),
    });
  }, [endParam, eventId, modalMode, startParam]);

  useEffect(() => {
    if (modalMode === 'edit' && existingEvent) {
      if (hydratedKeyRef.current === setupKey && hydratedEventIdRef.current === existingEvent.id) {
        return;
      }

      setTitle(existingEvent.title ?? '');
      setLocation(existingEvent.location ?? '');
      setDescription(existingEvent.description ?? '');
      setSelectedCalendarId(existingEvent.calendarId || defaultCalendarId);
      setStartTime(new Date(existingEvent.start));
      setEndTime(new Date(existingEvent.end));
      setError(null);
      hydratedEventIdRef.current = existingEvent.id;
      hydratedKeyRef.current = setupKey;
      return;
    }

    if (hydratedKeyRef.current === setupKey) return;

    const fromParamStart = parseMaybeDate(startParam) ?? new Date();
    const fromParamEnd = parseMaybeDate(endParam) ?? addMinutes(fromParamStart, 60);

    setTitle('');
    setLocation('');
    setDescription('');
    setSelectedCalendarId(calendarIdParam || defaultCalendarId);
    setStartTime(fromParamStart);
    setEndTime(fromParamEnd > fromParamStart ? fromParamEnd : addMinutes(fromParamStart, 60));
    setError(null);
    hydratedEventIdRef.current = null;
    hydratedKeyRef.current = setupKey;
  }, [
    calendarIdParam,
    defaultCalendarId,
    endParam,
    existingEvent,
    modalMode,
    setupKey,
    startParam,
  ]);

  const canDelete = modalMode === 'edit' && Boolean(existingEvent?.id);
  const saveLabel = modalMode === 'edit' ? 'Save Changes' : 'Create Event';

  const closeDrawer = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  const handleSave = async () => {
    if (saving || deleting) return;
    setError(null);

    if (!selectedCalendarId) {
      setError('Select a calendar first.');
      return;
    }

    if (endTime <= startTime) {
      setError('End time must be after start time.');
      return;
    }

    const payload = {
      title: title.trim() || 'New event',
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      allDay: false,
      calendarId: selectedCalendarId,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    setSaving(true);
    try {
      if (modalMode === 'edit' && existingEvent?.id) {
        await calendarData.updateEvent(existingEvent.id, payload);
      } else {
        await calendarData.createEvent(payload);
      }
      closeDrawer();
    } catch (saveError) {
      logger.error('Failed to save event', {
        mode: modalMode,
        eventId: existingEvent?.id ?? null,
        error: saveError instanceof Error ? saveError.message : 'unknown',
      });
      setError('Failed to save event. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existingEvent?.id || saving || deleting) return;

    Alert.alert('Delete event?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          setError(null);
          try {
            await calendarData.deleteEvent(existingEvent.id);
            closeDrawer();
          } catch (deleteError) {
            logger.error('Failed to delete event', {
              eventId: existingEvent.id,
              error: deleteError instanceof Error ? deleteError.message : 'unknown',
            });
            setError('Failed to delete event. Try again.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <View style={styles.backdropLayer}>
        <Pressable style={styles.backdropTouchable} onPress={closeDrawer} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.headerRow}>
              <View>
                <Text style={styles.kicker}>Event Drawer</Text>
                <Text style={styles.title}>{modalMode === 'edit' ? 'Edit Event' : 'New Event'}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={closeDrawer}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <View style={styles.section}>
                <Text style={styles.label}>Title</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Event title"
                  placeholderTextColor={palette.mutedText}
                  style={styles.input}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Location</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Optional location"
                  placeholderTextColor={palette.mutedText}
                  style={styles.input}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Optional notes"
                  placeholderTextColor={palette.mutedText}
                  multiline
                  textAlignVertical="top"
                  style={styles.textArea}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Time</Text>
                <View style={styles.readonlyCard}>
                  <Text style={styles.readonlyHeading}>Start</Text>
                  <Text style={styles.readonlyValue}>{formatDateTime(startTime)}</Text>
                </View>
                <View style={styles.readonlyCard}>
                  <Text style={styles.readonlyHeading}>End</Text>
                  <Text style={styles.readonlyValue}>{formatDateTime(endTime)}</Text>
                </View>
                <View style={styles.timeButtons}>
                  <Pressable
                    style={styles.timeButton}
                    onPress={() => {
                      setStartTime((prev) => addMinutes(prev, -15));
                      setEndTime((prev) => addMinutes(prev, -15));
                    }}
                  >
                    <Text style={styles.timeButtonText}>-15m</Text>
                  </Pressable>
                  <Pressable
                    style={styles.timeButton}
                    onPress={() => {
                      setStartTime((prev) => addMinutes(prev, 15));
                      setEndTime((prev) => addMinutes(prev, 15));
                    }}
                  >
                    <Text style={styles.timeButtonText}>+15m</Text>
                  </Pressable>
                  <Pressable
                    style={styles.timeButton}
                    onPress={() => {
                      const now = new Date();
                      setStartTime(now);
                      setEndTime(addMinutes(now, 60));
                    }}
                  >
                    <Text style={styles.timeButtonText}>Now</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Calendar</Text>
                {calendarData.calendars.map((calendar) => {
                  const selected = selectedCalendarId === calendar.id;
                  const dotStyle = calendar.color.startsWith('#')
                    ? { backgroundColor: calendar.color }
                    : undefined;

                  return (
                    <Pressable
                      key={calendar.id}
                      style={[
                        styles.calendarChip,
                        selected ? styles.calendarChipSelected : undefined,
                      ]}
                      onPress={() => setSelectedCalendarId(calendar.id)}
                    >
                      <Text style={[styles.calendarChipText, selected ? styles.calendarChipTextSelected : undefined]}>
                        {calendar.name}
                      </Text>
                      <View style={[styles.calendarDot, dotStyle]} />
                    </Pressable>
                  );
                })}
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              {canDelete ? (
                <Pressable
                  style={[styles.deleteButton, (saving || deleting) && styles.buttonDisabled]}
                  onPress={handleDelete}
                  disabled={saving || deleting}
                >
                  {deleting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  )}
                </Pressable>
              ) : null}

              <Pressable
                style={[styles.saveButton, (saving || deleting) && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saving || deleting}
              >
                {saving ? (
                  <ActivityIndicator color={palette.accentText} />
                ) : (
                  <Text style={styles.saveButtonText}>{saveLabel}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

function createStyles(palette: DrawerPalette) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.backdrop,
    },
    backdropLayer: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdropTouchable: {
      ...StyleSheet.absoluteFillObject,
    },
    sheet: {
      maxHeight: '88%',
      backgroundColor: palette.sheetBg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 10,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 999,
      backgroundColor: palette.border,
      marginBottom: 10,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    kicker: {
      color: palette.mutedText,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    title: {
      color: palette.text,
      fontSize: 20,
      fontWeight: '800',
      marginTop: 2,
    },
    closeButton: {
      minHeight: 44,
      minWidth: 44,
      borderRadius: 12,
      backgroundColor: palette.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    closeButtonText: {
      color: palette.mutedText,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    scroll: {
      maxHeight: '100%',
    },
    scrollContent: {
      paddingBottom: 12,
      gap: 10,
    },
    section: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.sheetBg,
      padding: 12,
      gap: 8,
    },
    label: {
      color: palette.mutedText,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    input: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.inputBorder,
      backgroundColor: palette.inputBg,
      paddingHorizontal: 12,
      color: palette.text,
      fontSize: 15,
      fontWeight: '500',
    },
    textArea: {
      minHeight: 94,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.inputBorder,
      backgroundColor: palette.inputBg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: palette.text,
      fontSize: 15,
      fontWeight: '500',
    },
    readonlyCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.inputBorder,
      backgroundColor: palette.inputBg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 6,
    },
    readonlyHeading: {
      color: palette.mutedText,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    readonlyValue: {
      color: palette.text,
      marginTop: 3,
      fontSize: 14,
      fontWeight: '600',
    },
    timeButtons: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
    },
    timeButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: palette.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timeButtonText: {
      color: palette.text,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    calendarChip: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.chipBg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    calendarChipSelected: {
      borderColor: palette.chipSelectedBorder,
      backgroundColor: palette.chipSelectedBg,
    },
    calendarChipText: {
      color: palette.text,
      fontSize: 14,
      fontWeight: '700',
    },
    calendarChipTextSelected: {
      color: palette.accent,
    },
    calendarDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
      backgroundColor: palette.accent,
    },
    errorBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${palette.danger}66`,
      backgroundColor: `${palette.danger}18`,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    errorText: {
      color: palette.danger,
      fontSize: 13,
      fontWeight: '600',
    },
    footer: {
      flexDirection: 'row',
      gap: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.sheetBg,
      padding: 8,
      marginTop: 8,
    },
    deleteButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: palette.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteButtonText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    saveButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonText: {
      color: palette.accentText,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
  });
}
