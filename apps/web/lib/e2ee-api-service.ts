import { httpClient, HttpClient } from "./http-client";
import type {
  E2eeBootstrapResponse,
  E2eeDeviceRecord,
  E2eePasswordRecord,
  E2eeResetSnapshotResponse,
  UpsertE2eeDeviceRequest,
  UpsertE2eePasswordRequest,
} from "./types/calendar";

export class E2eeApiService {
  constructor(private readonly client: HttpClient = httpClient) {}

  async getBootstrap(): Promise<E2eeBootstrapResponse> {
    return this.client.get<E2eeBootstrapResponse>("/api/e2ee/bootstrap");
  }

  async getResetSnapshot(): Promise<E2eeResetSnapshotResponse> {
    return this.client.get<E2eeResetSnapshotResponse>(
      "/api/e2ee/reset-snapshot",
    );
  }

  async upsertDevice(
    request: UpsertE2eeDeviceRequest,
  ): Promise<E2eeDeviceRecord> {
    return this.client.put<E2eeDeviceRecord>("/api/e2ee/device", request);
  }

  async upsertPasswordEnvelope(
    request: UpsertE2eePasswordRequest,
  ): Promise<E2eePasswordRecord> {
    return this.client.put<E2eePasswordRecord>("/api/e2ee/password", request);
  }
}

export const e2eeApiService = new E2eeApiService();