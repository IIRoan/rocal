import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createLogger } from '@workspace/logger';
import { Button } from '@workspace/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/ui/card';
import { Input } from '@workspace/ui/components/ui/input';

import { probeBackendReachability, signInWithGitHub } from '@/lib/auth-client';

const logger = createLogger('mobile:sign-up');

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailSignUp = () => {
    setError('Account creation on mobile currently uses GitHub OAuth. Continue with GitHub below.');
  };

  const handleGitHubSignUp = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      logger.step('Starting GitHub sign-up attempt');

      await probeBackendReachability('sign-up-submit');

      const result = await signInWithGitHub();

      if (result.error) {
        logger.warn('GitHub sign-up attempt returned an auth error', {
          message: result.error.message || 'GitHub sign up failed.',
        });
        setError(result.error.message || 'GitHub sign up failed.');
        return;
      }

      logger.ok('GitHub sign-up attempt completed');
      router.replace('/(tabs)');
    } catch (err) {
      logger.error('GitHub sign-up attempt threw unexpectedly', {
        error: err,
      });
      setError(err instanceof Error ? err.message : 'GitHub sign up failed.');
    } finally {
      logger.debug('GitHub sign-up submission finished');
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background" edges={['top', 'right', 'bottom', 'left']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <View className="flex-1 justify-center px-4 py-6">
            <Card className="w-full max-w-sm self-center rounded-2xl border-border/70 bg-card shadow-sm dark:border-border/50 dark:bg-card/95">
              <CardHeader className="items-center gap-3 pb-2 text-center">
                <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 dark:bg-primary/20">
                  <Text className="text-xl font-extrabold text-primary">S</Text>
                </View>
                <Text className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  Solace
                </Text>
                <CardTitle className="text-xl font-semibold text-foreground">Create account</CardTitle>
                <CardDescription className="text-center text-sm text-muted-foreground">
                  Start planning with your team in minutes
                </CardDescription>
              </CardHeader>

              <CardContent className="gap-3">
                {error ? (
                  <View className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 dark:border-destructive/40">
                    <Text className="text-sm text-destructive">{error}</Text>
                  </View>
                ) : null}

                <View className="gap-2">
                  <Text className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Name
                  </Text>
                  <Input
                    value={name}
                    onChangeText={setName}
                    placeholder="Your full name"
                    autoCapitalize="words"
                    autoCorrect={false}
                    className="rounded-xl border-border/70 bg-background/80 dark:border-border/50 dark:bg-background/40"
                  />
                </View>

                <View className="gap-2">
                  <Text className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Email
                  </Text>
                  <Input
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@company.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    type="email"
                    className="rounded-xl border-border/70 bg-background/80 dark:border-border/50 dark:bg-background/40"
                  />
                </View>

                <View className="gap-2">
                  <Text className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Password
                  </Text>
                  <Input
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Create a password"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    type="password"
                    className="rounded-xl border-border/70 bg-background/80 dark:border-border/50 dark:bg-background/40"
                  />
                </View>

                <Button
                  variant="outline"
                  onPress={handleEmailSignUp}
                  className="w-full rounded-xl border-border/70 dark:border-border/50"
                >
                  Create account with Email
                </Button>

                <View className="my-1 flex-row items-center gap-2">
                  <View className="h-px flex-1 bg-border/70 dark:bg-border/50" />
                  <Text className="text-xs text-muted-foreground">or</Text>
                  <View className="h-px flex-1 bg-border/70 dark:bg-border/50" />
                </View>

                <Button
                  onPress={() => void handleGitHubSignUp()}
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-primary dark:bg-primary"
                >
                  {isSubmitting ? 'Connecting to GitHub…' : 'Continue with GitHub'}
                </Button>

                <View className="items-center pt-1">
                  <Text className="text-sm text-muted-foreground">Already have an account?</Text>
                  <Button
                    variant="ghost"
                    onPress={() => router.push('/sign-in')}
                    className="mt-1 min-h-11"
                  >
                    Sign in
                  </Button>
                </View>
              </CardContent>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
