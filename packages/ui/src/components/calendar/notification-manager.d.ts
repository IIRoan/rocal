export interface EventNotification {
    id?: string;
    notificationType: "email";
    minutesBefore: number;
    notificationTime?: string;
    isEnabled: boolean;
    isSent?: boolean;
}
interface NotificationManagerProps {
    eventId?: string;
    notifications: EventNotification[];
    onChange: (notifications: EventNotification[]) => void;
    loading?: boolean;
    defaultReminder?: number | null;
}
export declare function NotificationManager({ eventId, notifications, onChange, loading, defaultReminder, }: NotificationManagerProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=notification-manager.d.ts.map