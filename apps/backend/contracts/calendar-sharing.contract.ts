import type {
  CalendarShareLinkResponse,
  DisableCalendarShareLinkResponse,
} from "@workspace/calendar-ics";

export type ShareLinkInput = {
  userId: string;
  calendarId: string;
  baseUrl: string;
};

export type CreateShareLinkInput = ShareLinkInput & {
  regenerate?: boolean;
};

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
