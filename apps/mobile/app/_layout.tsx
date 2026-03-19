import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Href, Redirect, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import '../global.css';
import { createLogger, installGlobalConsoleLogger } from '@workspace/logger';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiBaseUrl, authClient, probeBackendReachability } from '@/lib/auth-client';
import { CalendarDataProvider } from '@workspace/ui/components/calendar';
import { setHttpClientAuthCookieProvider, setHttpClientBaseURL } from '@workspace/calendar-client';

export const unstable_settings = {
  anchor: '(tabs)',
};

const logger = createLogger('mobile:root');

// Singleton QueryClient instance
let queryClientInstance: QueryClient | null = null;

function getQueryClient() {
  if (!queryClientInstance) {
    queryClientInstance = new QueryClient();
  }
  return queryClientInstance;
}

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    installGlobalConsoleLogger('mobile');
    logger.info('Mobile app logger installed', {
      apiBaseUrl,
    });

    setHttpClientBaseURL(apiBaseUrl);
    setHttpClientAuthCookieProvider(() => authClient.getCookie());
    logger.info('Configured shared calendar HTTP client for mobile', {
      baseURL: apiBaseUrl,
      hasCookieProvider: true,
    });

    void probeBackendReachability('app-startup');

    return () => {
      logger.info('Clearing shared calendar HTTP client configuration');
      setHttpClientBaseURL(null);
      setHttpClientAuthCookieProvider(null);
    };
  }, []);

  useEffect(() => {
    logger.debug('Session state changed', {
      pathname,
      isPending,
      isAuthenticated: Boolean(session?.user),
      userId: session?.user?.id ?? null,
      userEmail: session?.user?.email ?? null,
    });
  }, [isPending, pathname, session?.user]);

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator
          size="large"
          color={colorScheme === 'dark' ? DarkTheme.colors.text : DefaultTheme.colors.text}
        />
      </View>
    );
  }

  const isAuthRoute = pathname === '/sign-in' || pathname === '/sign-up';

  if (!session?.user && !isAuthRoute) {
    logger.warn('Redirecting unauthenticated user to sign-in', {
      pathname,
    });
    return <Redirect href={'/sign-in' as Href} />;
  }

  const navigator = (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );

  const content =
    session?.user && isAuthRoute ? (
      <Redirect href="/(tabs)" />
    ) : (
      navigator
    );

  if (session?.user && isAuthRoute) {
    logger.info('Redirecting authenticated user away from auth route', {
      pathname,
      userId: session.user.id,
    });
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {session?.user ? <CalendarDataProvider>{content}</CalendarDataProvider> : content}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <RootLayoutContent />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
