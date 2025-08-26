export declare class CalendarSyncService {
    private static instance;
    private intervalId;
    private isRunning;
    private constructor();
    static getInstance(): CalendarSyncService;
    start(): void;
    stop(): void;
    syncAllActiveSubscriptions(): Promise<void>;
    syncSubscription(subscriptionId: string): Promise<void>;
    private cleanupOldSyncLogs;
    getStatus(): {
        isRunning: boolean;
        nextSyncIn?: number;
    };
    getSubscriptionStats(): Promise<{
        total: number;
        active: number;
        inactive: number;
        withErrors: number;
        neverSynced: number;
    }>;
}
//# sourceMappingURL=calendar-sync-service.d.ts.map