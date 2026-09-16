/** Module-level mirror of the E2EE session so non-React modules can seal data. */
export interface ActiveE2eeSession {
  userId: string;
  deviceId: string;
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
}

let activeE2eeSession: ActiveE2eeSession | null = null;

export function getActiveE2eeSession(): ActiveE2eeSession | null {
  return activeE2eeSession;
}

export function setActiveE2eeSession(session: ActiveE2eeSession | null): void {
  activeE2eeSession = session;
}
