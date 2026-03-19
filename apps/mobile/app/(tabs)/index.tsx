import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MobileCalendarWrapper } from '@workspace/ui/components/calendar';

import { authClient } from '@/lib/auth-client';

export default function CalendarScreen() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
      <MobileCalendarWrapper
        initialView="day"
        weekStartDay={1}
        user={{
          name: session?.user.name ?? 'Unknown User',
          email: session?.user.email ?? '',
          avatar: session?.user.image ?? undefined,
          hasAiAccess: Boolean((session?.user as { hasAiAccess?: boolean } | undefined)?.hasAiAccess),
        }}
        onOpenSettings={() => router.push('/(tabs)/explore')}
        onOpenCalendarManagement={() => router.push('/(tabs)/explore')}
      />
    </SafeAreaView>
  );
}
