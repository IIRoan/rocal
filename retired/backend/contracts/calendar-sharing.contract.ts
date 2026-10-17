import type {
  CalendarShareLinkResponse,
  DisableCalendarShareLinkResponse,
} from "@workspace/calendar-ics";
import {
  createShareLinkInputSchema,
  shareLinkInputSchema,
  type CreateShareLinkInput,
  type ShareLinkInput,
} from "./calendar.contract";

export { createShareLinkInputSchema, shareLinkInputSchema };
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
