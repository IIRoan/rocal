import { AccountApiService } from "@workspace/calendar-client";
import { httpClient } from "./http-client";

export const accountApiService = new AccountApiService(httpClient);