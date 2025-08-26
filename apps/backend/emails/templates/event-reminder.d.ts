import * as React from "react";
interface EventReminderEmailProps {
    eventTitle: string;
    eventDate: string;
    eventTime: string;
    eventLocation?: string;
    categoryName?: string;
    categoryColor?: string;
    description?: string;
    timeUntilEvent: string;
    duration?: string;
    reminderText?: string;
    userName?: string;
    userEmail?: string;
    userTheme?: "light" | "dark" | "system";
}
export declare const EventReminderEmail: ({ eventTitle, eventDate, eventTime, eventLocation, categoryName, categoryColor, description, timeUntilEvent, duration, reminderText, userName, userEmail, userTheme, }: EventReminderEmailProps) => React.JSX.Element;
export default EventReminderEmail;
//# sourceMappingURL=event-reminder.d.ts.map