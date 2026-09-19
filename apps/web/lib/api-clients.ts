import {
  AccountApiService,
  HttpClient,
  InviteApiService,
} from "@workspace/calendar-client";
import { getApiBaseUrl } from "./api-url";
import { redirectToPasskeyStepUpLogin } from "./auth-navigation";

export const httpClient = new HttpClient({
  baseURL: getApiBaseUrl(),
  onPasskeyStepUpRequired: redirectToPasskeyStepUpLogin,
});
export const accountApiService = new AccountApiService(httpClient);
export const inviteApiService = new InviteApiService(httpClient);
