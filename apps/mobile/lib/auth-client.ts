import '@/lib/zod-meta-shim';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { createLogger } from '@workspace/logger';

WebBrowser.maybeCompleteAuthSession();

const logger = createLogger('mobile:auth');

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');

  if (trimmed.endsWith('/api')) {
    return trimmed.slice(0, -4);
  }

  return trimmed;
}

export function maskEmailForLogs(value: string): string {
  const email = value.trim().toLowerCase();
  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    return email || '<empty>';
  }

  if (localPart.length <= 2) {
    return `${localPart[0] ?? '*'}*@${domain}`;
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

function getApiBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    const normalizedEnvUrl = normalizeApiBaseUrl(envUrl);
    logger.info('Using EXPO_PUBLIC_API_URL for mobile auth client', {
      baseURL: normalizedEnvUrl,
    });
    return normalizedEnvUrl;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost ||
    '';
  const hostname = hostUri.split(':')[0];

  if (hostname && Platform.OS !== 'web') {
    const inferredUrl = `http://${hostname}:3001`;
    logger.info('Inferred mobile API base URL from Expo host', {
      hostUri,
      hostname,
      baseURL: inferredUrl,
      platform: Platform.OS,
    });
    return inferredUrl;
  }

  if (Platform.OS === 'android') {
    logger.info('Using Android emulator API base URL fallback', {
      baseURL: 'http://10.0.2.2:3001',
    });
    return 'http://10.0.2.2:3001';
  }

  logger.info('Using localhost API base URL fallback', {
    baseURL: 'http://localhost:3001',
    platform: Platform.OS,
  });
  return 'http://localhost:3001';
}

export const apiBaseUrl = getApiBaseUrl();

const storage =
  Platform.OS === 'web'
    ? {
        getItem: (key: string) =>
          typeof window === 'undefined' ? null : window.localStorage.getItem(key),
        setItem: (key: string, value: string) => {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, value);
          }
        },
      }
    : {
        getItem: SecureStore.getItem,
        setItem: SecureStore.setItem,
      };

const scheme =
  typeof Constants.expoConfig?.scheme === 'string'
    ? Constants.expoConfig.scheme
    : 'solacemobile';

export const mobileAuthCallbackUrl = `${scheme}://sign-in`;

logger.info('Initializing mobile Better Auth client', {
  baseURL: apiBaseUrl,
  basePath: '/api/auth',
  scheme,
  platform: Platform.OS,
  storage: Platform.OS === 'web' ? 'localStorage' : 'secure-store',
});

export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
  basePath: '/api/auth',
  plugins: [
    expoClient({
      scheme,
      storage,
      storagePrefix: scheme,
      cookiePrefix: 'better-auth',
    }),
  ],
});

export async function probeBackendReachability(reason: string): Promise<boolean> {
  const probeUrl = `${apiBaseUrl}/api/health`;
  const startedAt = Date.now();

  logger.step('Probing backend reachability', {
    reason,
    probeUrl,
  });

  try {
    const response = await fetch(probeUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      logger.warn('Backend reachability probe returned non-OK response', {
        reason,
        probeUrl,
        status: response.status,
        durationMs,
      });
      return false;
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    logger.ok('Backend reachability probe succeeded', {
      reason,
      probeUrl,
      status: response.status,
      durationMs,
      payload,
    });
    return true;
  } catch (error) {
    logger.error('Backend reachability probe failed', {
      reason,
      probeUrl,
      durationMs: Date.now() - startedAt,
      error,
    });
    return false;
  }
}

export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const signUp = authClient.signUp;
export const useSession = authClient.useSession;

export async function signInWithGitHub() {
  return authClient.signIn.social({
    provider: 'github',
    callbackURL: mobileAuthCallbackUrl,
  });
}
