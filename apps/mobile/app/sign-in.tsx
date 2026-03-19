import { router } from 'expo-router';
import { useState } from 'react';
import { createLogger } from '@workspace/logger';
import { MobileAuthCard } from '@workspace/ui/components/mobile';

import { probeBackendReachability, signInWithGitHub } from '@/lib/auth-client';

const logger = createLogger('mobile:sign-in');

export default function SignInScreen() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      logger.step('Starting GitHub sign-in attempt');

      await probeBackendReachability('sign-in-submit');

      const result = await signInWithGitHub();

      if (result.error) {
        logger.warn('GitHub sign-in attempt returned an auth error', {
          message: result.error.message || 'GitHub sign in failed.',
        });
        setError(result.error.message || 'GitHub sign in failed.');
        return;
      }

      logger.ok('GitHub sign-in attempt completed');
      router.replace('/(tabs)');
    } catch (err) {
      logger.error('GitHub sign-in attempt threw unexpectedly', {
        error: err,
      });
      setError(err instanceof Error ? err.message : 'GitHub sign in failed.');
    } finally {
      logger.debug('GitHub sign-in submission finished');
      setIsSubmitting(false);
    }
  };

  return (
    <MobileAuthCard
      appName="Rocani Mobile"
      loading={isSubmitting}
      error={error}
      onSubmit={() => void handleSignIn()}
    />
  );
}
