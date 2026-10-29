import {
  createShareLinkInputSchema,
  shareLinkInputSchema,
  type CreateShareLinkInput,
  type ShareLinkInput,
} from "./calendar.contract";

export { createShareLinkInputSchema, shareLinkInputSchema };

// The retired API keeps the share-link shapes the shared packages dropped.
export interface CalendarShareLinkResponse {
  calendarId: string;
  calendarName: string;
  enabled: boolean;
  shareUrl: string | null;
}

export interface DisableCalendarShareLinkResponse {
  success: boolean;
}
export type { CreateShareLinkInput, ShareLinkInput };

export interface ICalendarSharingService {
  getShareLink(input: ShareLinkInput): Promise<CalendarShareLinkResponse>;
  createShareLink(
    input: CreateShareLinkInput,
  ): Promise<CalendarShareLinkResponse>;
  disableShareLink(
    input: ShareLinkInput,
  ): Promise<DisableCalendarShareLinkResponse>;
  getSharedCalendarIcs(
    token: string,
    sourceUrl: string,
  ): Promise<{ icsContent: string; calendarName: string }>;
}
