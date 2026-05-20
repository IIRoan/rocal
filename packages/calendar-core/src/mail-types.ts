export type MailVaultKdfParams = {
  saltB64: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
};

export type MailOAuthConfig = {
  issuer: string;
  discoveryUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  mailTokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  audiences: string[];
};

export type MailDemoConfig = {
  defaultDomain: string;
  discoveryBaseUrl: string;
  signupEnabled: boolean;
  oauth: MailOAuthConfig;
  vaultKeyMaterialEndpoint: string;
};

export type MailAccountStatus = {
  email: string;
  displayName: string | null;
  provisioned: boolean;
};

export type MailSignup = {
  email: string;
  displayName: string | null;
  stalwartAccountId: string;
  stalwartPublicKeyId: string;
  fingerprint: string;
  encryptionAtRestEnabled: boolean;
};

export type MailDirectoryKey = {
  email: string;
  publicKeyArmored: string;
  fingerprint: string;
  source: string;
  trust: string;
};

export type MailVaultBackup = {
  email: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};
