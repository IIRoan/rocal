import type { StalwartWebhookPayload } from "../lib/stalwart-webhook";

export type StalwartWebhookHandleResult = {
  processedCount: number;
  enqueuedCount: number;
  ignoredCount: number;
};

export interface IStalwartWebhookService {
  handlePayload(
    payload: StalwartWebhookPayload,
  ): Promise<StalwartWebhookHandleResult>;
}
