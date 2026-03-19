import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useSharedCalendarData } from '@workspace/ui/components/calendar';
import { MobileAccountScreen } from '@workspace/ui/components/mobile';
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
    <MobileAccountScreen
      userName={session?.user.name}
      userEmail={session?.user.email}
      calendarsCount={calendars.length}
      categoriesCount={categories.length}
      eventsLoading={eventsLoading}
      eventsError={eventsError?.message ?? null}
      signingOut={isSigningOut}
      onSignOut={() => void handleSignOut()}
    />
  );
}
