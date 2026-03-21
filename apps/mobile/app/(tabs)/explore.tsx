import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { MobileAccountScreen } from '@workspace/ui/components/mobile';
import { authClient } from '@/lib/auth-client';

export default function SettingsScreen() {
  const queryClient = useQueryClient();
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
      signingOut={isSigningOut}
      onSignOut={() => void handleSignOut()}
    />
  );
}
