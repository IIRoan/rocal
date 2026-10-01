export interface ActiveE2eeSession {
  userId: string;
  deviceId: string;
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
  activatedAt: Date;
}

let activeE2eeSession: ActiveE2eeSession | null = null;
const listeners = new Set<() => void>();

export function subscribeActiveE2eeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveE2eeSession(): ActiveE2eeSession | null {
  return activeE2eeSession;
}

export function setActiveE2eeSession(session: ActiveE2eeSession): void {
  activeE2eeSession = session;
  for (const listener of listeners) listener();
}

export function clearActiveE2eeSession(): void {
  activeE2eeSession = null;
  for (const listener of listeners) listener();
}

export function hasActiveE2eeSession(): boolean {
  return activeE2eeSession !== null;
}
