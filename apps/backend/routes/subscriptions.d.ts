export declare const subscriptionsRoute: any;
export declare function syncCalendarSubscription(subscription: any): Promise<{
    status: string;
    message: string;
    eventsAdded?: undefined;
    eventsUpdated?: undefined;
    eventsDeleted?: undefined;
    errors?: undefined;
} | {
    status: string;
    eventsAdded: number;
    eventsUpdated: number;
    eventsDeleted: number;
    errors: any;
    message?: undefined;
}>;
//# sourceMappingURL=subscriptions.d.ts.map