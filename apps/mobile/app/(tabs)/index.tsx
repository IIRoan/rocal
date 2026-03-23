import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MobileCalendarWrapper } from '@workspace/ui/components/calendar';
import type { CalendarEvent } from '@workspace/ui/components/calendar';
import { createLogger } from '@workspace/logger';

import { authClient } from '@/lib/auth-client';
import { NativeErrorBoundary } from '@/components/native-error-boundary';

const logger = createLogger('mobile:calendar-screen');

export default function CalendarScreen() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const openEventEditor = useCallback(
    (event: CalendarEvent) => {
      logger.info('Opening event editor', {
        mode: event.id ? 'edit' : 'create',
        eventId: event.id ?? null,
        calendarId: event.calendarId ?? null,
        start: event.start ? new Date(event.start).toISOString() : null,
      });

      router.push({
        pathname: '/modal',
        params: {
          mode: event.id ? 'edit' : 'create',
          eventId: event.id ?? '',
          calendarId: event.calendarId ?? '',
          start: event.start ? new Date(event.start).toISOString() : '',
          end: event.end ? new Date(event.end).toISOString() : '',
        },
      });
    },
    [router],
  );

  const openAddEvent = useCallback(() => {
    logger.info('Opening event editor from add action');
    router.push({ pathname: '/modal', params: { mode: 'create' } });
  }, [router]);

  logger.debug('Rendering calendar screen', {
    hasUser: Boolean(session?.user),
    userId: session?.user?.id ?? null,
  });

  return (
    <NativeErrorBoundary label="calendar-screen">
      <SafeAreaView
        style={{ flex: 1 }}
        className="bg-background"
        edges={['top', 'bottom', 'left', 'right']}
      >
        <MobileCalendarWrapper
          initialView="day"
          weekStartDay={1}
          user={{
            name: session?.user.name ?? 'Unknown User',
            email: session?.user.email ?? '',
            avatar: session?.user.image ?? undefined,
            hasAiAccess: Boolean((session?.user as { hasAiAccess?: boolean } | undefined)?.hasAiAccess),
          }}
          onEventEdit={openEventEditor}
          onOpenAddEvent={openAddEvent}
          onOpenSettings={() => router.push('/(tabs)/explore')}
          onOpenCalendarManagement={() => router.push('/(tabs)/explore')}
        />
      </SafeAreaView>
    </NativeErrorBoundary>
  );
}
