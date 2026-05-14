import { InviteApiService } from "@workspace/calendar-client";
import { httpClient } from "./http-client";

export const inviteApiService = new InviteApiService(httpClient);
