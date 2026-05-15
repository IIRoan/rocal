export interface ActiveE2eeSession {
  userId: string;
  deviceId: string;
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
  activatedAt: Date;
}

let activeE2eeSession: ActiveE2eeSession | null = null;

export function getActiveE2eeSession(): ActiveE2eeSession | null {
  return activeE2eeSession;
}

export function setActiveE2eeSession(session: ActiveE2eeSession): void {
  activeE2eeSession = session;
}

export function clearActiveE2eeSession(): void {
  activeE2eeSession = null;
}

export function hasActiveE2eeSession(): boolean {
  return activeE2eeSession !== null;
}
