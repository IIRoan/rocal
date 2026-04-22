export type EncryptionDeviceRecord = {
  id: string;
  userId: string;
  deviceId: string;
  deviceLabel: string | null;
  publicKey: string;
  publicKeyAlgorithm: string;
  wrappedAccountKey: string;
  wrappedSearchKey: string;
  wrapAlgorithm: string;
  keyVersion: number;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type EncryptionCalendarRecord = {
  id: string;
  name: string;
  encryptedName: string | null;
  blindIndexTokens: string[];
  encryptionState: string;
  encryptionKeyVersion: number;
  color: string;
  kind: string;
  isDefault: boolean;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type E2eeBootstrapResult = {
  enabled: true;
  rolloutStage: "shadow_write";
  algorithms: {
    content: "AES-GCM-256";
    blindIndex: "HMAC-SHA-256";
    wrapping: string;
  };
  devices: EncryptionDeviceRecord[];
  calendars: EncryptionCalendarRecord[];
};

export type UpsertEncryptionDeviceInput = {
  userId: string;
  deviceId: string;
  deviceLabel?: string;
  publicKey: string;
  publicKeyAlgorithm?: string;
  wrappedAccountKey: string;
  wrappedSearchKey: string;
  wrapAlgorithm?: string;
  keyVersion?: number;
};

export interface IE2eeService {
  getBootstrap(userId: string): Promise<E2eeBootstrapResult>;
  upsertDevice(input: UpsertEncryptionDeviceInput): Promise<EncryptionDeviceRecord>;
}