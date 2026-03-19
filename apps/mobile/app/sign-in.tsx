import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createLogger } from '@workspace/logger';

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
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Rocani Mobile</Text>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>
              Continue with GitHub. Password sign-in is disabled on mobile.
            </Text>
          </View>

          <View style={styles.form}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={handleSignIn}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && !isSubmitting ? styles.primaryButtonPressed : null,
                isSubmitting ? styles.primaryButtonDisabled : null,
              ]}>
              {isSubmitting ? (
                <ActivityIndicator color="#f8fafc" />
              ) : (
                <Text style={styles.primaryButtonText}>Continue with GitHub</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Your account is created automatically the first time you sign in with GitHub.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 24,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
  },
  form: {
    gap: 12,
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    color: '#475569',
    fontSize: 14,
    textAlign: 'center',
  },
});
