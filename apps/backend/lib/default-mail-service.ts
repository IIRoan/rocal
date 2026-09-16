import type { MailOAuthConfig } from "../contracts/mail.contract";
import { MailService } from "../services/mail.service";
import { env } from "./env";
import {
  buildStalwartMailBridgeRedirectUri,
  getStalwartMailBridgeClientId,
} from "./mail-bridge-auth";
import { prisma } from "./prisma";
import { createStalwartAdminClient } from "./stalwart-admin";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export const publicJmapProxyBaseUrl = `${normalizeBaseUrl(env.backendUrl)}/api/mail/jmap`;

function buildMailOAuthConfig(): MailOAuthConfig {
  return {
    mailTokenEndpoint: `${normalizeBaseUrl(env.backendUrl)}/api/mail/oauth/access-token`,
  };
}

export const defaultMailService = new MailService(
  prisma,
  createStalwartAdminClient(),
  {
    defaultDomain: env.stalwartDefaultDomain,
    discoveryBaseUrl: publicJmapProxyBaseUrl,
    oauth: buildMailOAuthConfig(),
    stalwartOauthClientId: getStalwartMailBridgeClientId(),
    stalwartOauthRedirectUri: buildStalwartMailBridgeRedirectUri(),
  },
);
