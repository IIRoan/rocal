export type AssistantChatInput = {
  userId: string;
  query: string;
  timezone?: string;
  now?: string;
  events?: Array<{
    id: string;
    title: string;
    description?: string;
    start: string;
    end: string;
    allDay?: boolean;
    location?: string;
    calendarId: string;
  }>;
  cookies: string;
  request: Request;
};

export type AssistantChatResult = {
  reply: string;
  createdEvent: unknown | null;
  updatedEvent: unknown | null;
  deletedEventId: string | null;
  events: unknown[];
  error?: string;
};

export interface ICalendarAssistantService {
  chat(input: AssistantChatInput): Promise<AssistantChatResult>;
}
