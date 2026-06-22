import { prisma } from "./prisma";
import { syncCalendarSubscription } from "../routes/subscriptions";
import { errorLogDetails } from "./log-sanitization";
import { createLogger } from "@workspace/logger";

const logger = createLogger("backend:calendar-sync");

export class CalendarSyncService {
  private static instance: CalendarSyncService;
  private intervalId: NodeJS.Timeout | null = null;
  private initialSyncTimeoutId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isSyncing: boolean = false;

  private constructor() {}

  static getInstance(): CalendarSyncService {
    if (!CalendarSyncService.instance) {
      CalendarSyncService.instance = new CalendarSyncService();
    }
    return CalendarSyncService.instance;
  }

  start() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    // Run initial sync after a short delay
    this.initialSyncTimeoutId = setTimeout(() => {
      this.syncAllActiveSubscriptions().catch((error) => {
        logger.error("Initial sync failed", errorLogDetails(error));
      });
    }, 5000);
    this.initialSyncTimeoutId.unref?.();

    // Schedule regular syncing every 15 minutes
    this.intervalId = setInterval(
      async () => {
        if (this.isSyncing) {
          logger.warn(
            "Skipping scheduled sync because a previous sync is still running",
          );
          return;
        }

        try {
          this.isSyncing = true;
          await this.syncAllActiveSubscriptions();
        } catch (error) {
          logger.error("Scheduled sync failed", errorLogDetails(error));
        } finally {
          this.isSyncing = false;
        }
      },
      15 * 60 * 1000,
    ); // 15 minutes in milliseconds
    this.intervalId.unref?.();
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    if (this.initialSyncTimeoutId) {
      clearTimeout(this.initialSyncTimeoutId);
      this.initialSyncTimeoutId = null;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isSyncing = false;
    this.isRunning = false;
  }

  async syncAllActiveSubscriptions(): Promise<void> {
    try {
      // Get all active subscriptions that are due for syncing
      const subscriptions = await prisma.calendarSubscription.findMany({
        where: {
          isActive: true,
          OR: [
            // Never synced before
            { lastSyncAt: null },
            // Last sync was more than the sync interval ago
            {
              lastSyncAt: {
                lt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
              },
            },
          ],
        },
        include: {
          calendar: true,
          user: true,
        },
        orderBy: {
          lastSyncAt: "asc", // Sync oldest first
        },
      });

      const results = {
        total: subscriptions.length,
        success: 0,
        errors: 0,
        skipped: 0,
      };

      // Process subscriptions in batches to avoid overwhelming the system
      const batchSize = 5;
      for (let i = 0; i < subscriptions.length; i += batchSize) {
        const batch = subscriptions.slice(i, i + batchSize);

        const batchPromises = batch.map(async (subscription) => {
          try {
            // Check if subscription should be synced based on its individual interval
            const timeSinceLastSync = subscription.lastSyncAt
              ? Date.now() - subscription.lastSyncAt.getTime()
              : Infinity;

            const syncIntervalMs = subscription.syncIntervalMinutes * 60 * 1000;

            if (timeSinceLastSync < syncIntervalMs) {
              results.skipped++;
              return;
            }

            await syncCalendarSubscription(subscription);
            results.success++;
          } catch (error) {
            logger.error("Failed to sync subscription", {
              subscriptionId: subscription.id,
              ...errorLogDetails(error),
            });
            results.errors++;
          }
        });

        await Promise.allSettled(batchPromises);

        // Small delay between batches to be gentle on external servers
        if (i + batchSize < subscriptions.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Clean up old sync logs (keep last 50 per subscription)
      await this.cleanupOldSyncLogs();
    } catch (error) {
      logger.error("Error during scheduled sync", errorLogDetails(error));
    }
  }

  async syncSubscription(subscriptionId: string): Promise<void> {
    const subscription = await prisma.calendarSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        calendar: true,
        user: true,
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (!subscription.isActive) {
      throw new Error("Subscription is not active");
    }

    await syncCalendarSubscription(subscription);
  }

  private async cleanupOldSyncLogs(): Promise<void> {
    try {
      // Get all subscriptions
      const subscriptions = await prisma.calendarSubscription.findMany({
        select: { id: true },
      });

      // For each subscription, keep only the latest 50 sync logs
      for (const subscription of subscriptions) {
        const logs = await prisma.calendarSyncLog.findMany({
          where: { subscriptionId: subscription.id },
          select: { id: true },
          orderBy: { startedAt: "desc" },
          skip: 50, // Skip the first 50 (most recent)
        });

        if (logs.length > 0) {
          await prisma.calendarSyncLog.deleteMany({
            where: {
              id: { in: logs.map((log) => log.id) },
            },
          });
        }
      }
    } catch (error) {
      logger.error("Error cleaning up sync logs", errorLogDetails(error));
    }
  }

  getStatus(): { isRunning: boolean; nextSyncIn?: number } {
    if (!this.isRunning) {
      return { isRunning: false };
    }

    // Calculate rough time until next sync (this is approximate)
    const now = Date.now();
    const nextSyncTime =
      Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000) + 15 * 60 * 1000;
    const nextSyncIn = nextSyncTime - now;

    return {
      isRunning: true,
      nextSyncIn: Math.max(0, nextSyncIn),
    };
  }

  async getSubscriptionStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    withErrors: number;
    neverSynced: number;
  }> {
    const [total, active, withErrors, neverSynced] = await Promise.all([
      prisma.calendarSubscription.count(),
      prisma.calendarSubscription.count({ where: { isActive: true } }),
      prisma.calendarSubscription.count({ where: { lastSyncStatus: "error" } }),
      prisma.calendarSubscription.count({ where: { lastSyncAt: null } }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      withErrors,
      neverSynced,
    };
  }
}
