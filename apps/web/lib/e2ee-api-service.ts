import { httpClient, HttpClient } from "./http-client";
import type {
  E2eeBootstrapResponse,
  E2eeDeviceRecord,
  UpsertE2eeDeviceRequest,
} from "./types/calendar";

export class E2eeApiService {
  constructor(private readonly client: HttpClient = httpClient) {}

  async getBootstrap(): Promise<E2eeBootstrapResponse> {
    return this.client.get<E2eeBootstrapResponse>("/api/e2ee/bootstrap");
  }

  async upsertDevice(
    request: UpsertE2eeDeviceRequest,
  ): Promise<E2eeDeviceRecord> {
    return this.client.put<E2eeDeviceRecord>("/api/e2ee/device", request);
  }
}

export const e2eeApiService = new E2eeApiService();