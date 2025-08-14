import Elysia, { t } from 'elysia';
import { db } from '../lib/prisma';
import { parseICSFile, convertParsedEventToCalendarEvent, isEventModified } from '../lib/ics-parser';

export const subscriptionsRoute = new Elysia()
  .get(
    '/subscriptions',
    async ({ user }: any) => {
      const subscriptions = await db.calendarSubscription.findMany({
        where: {
          userId: user.id,
        },
        include: {
          calendar: true,
          _count: {
            select: {
              syncLogs: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return subscriptions;
    },
    {
      auth: true,
      detail: {
        tags: ['Calendar Subscriptions'],
        summary: 'Get all calendar subscriptions for user',
      },
    }
  )
  
  .post(
    '/subscriptions',
    async ({ body, user }: any) => {
      const { name, url, calendarId } = body;

      // Check if URL is already subscribed by this user
      const existingSubscription = await db.calendarSubscription.findFirst({
        where: {
          userId: user.id,
          url: url,
        },
      });

      if (existingSubscription) {
        throw new Error('You are already subscribed to this calendar URL');
      }

      // Verify calendar belongs to user
      const calendar = await db.calendar.findFirst({
        where: {
          id: calendarId,
          userId: user.id,
        },
      });

      if (!calendar) {
        throw new Error('Calendar not found or not owned by user');
      }

      // Test the URL by attempting to fetch and parse it
      let testParseResult;
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Calendar Sync Service/1.0',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
        }

        const icsContent = await response.text();
        testParseResult = parseICSFile(icsContent);
        
        if (testParseResult.errors.length > 0) {
          console.warn('ICS parsing warnings:', testParseResult.errors);
        }
      } catch (error) {
        throw new Error(`Unable to fetch or parse calendar from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Create the subscription
      const subscription = await db.calendarSubscription.create({
        data: {
          name: name || testParseResult.calendarName || 'External Calendar',
          url,
          userId: user.id,
          calendarId,
          lastSyncStatus: 'pending',
        },
        include: {
          calendar: true,
        },
      });

      return subscription;
    },
    {
      auth: true,
      body: t.Object({
        name: t.Optional(t.String()),
        url: t.String({ format: 'uri' }),
        calendarId: t.String(),
      }),
      detail: {
        tags: ['Calendar Subscriptions'],
        summary: 'Subscribe to an external calendar',
        description: 'Creates a new calendar subscription and validates the URL by attempting to fetch and parse it.',
      },
    }
  )
  
  .put(
    '/subscriptions/:id',
    async ({ params, body, user }: any) => {
      const { id } = params;
      const { name, isActive, syncIntervalMinutes } = body;

      const subscription = await db.calendarSubscription.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const updatedSubscription = await db.calendarSubscription.update({
        where: { id },
        data: {
          name: name || subscription.name,
          isActive: isActive !== undefined ? isActive : subscription.isActive,
          syncIntervalMinutes: syncIntervalMinutes || subscription.syncIntervalMinutes,
        },
        include: {
          calendar: true,
        },
      });

      return updatedSubscription;
    },
    {
      auth: true,
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean()),
        syncIntervalMinutes: t.Optional(t.Number({ minimum: 5, maximum: 1440 })),
      }),
      detail: {
        tags: ['Calendar Subscriptions'],
        summary: 'Update calendar subscription',
      },
    }
  )
  
  .delete(
    '/subscriptions/:id',
    async ({ params, user, query }: any) => {
      const { id } = params;
      const { deleteEvents = false } = query;

      const subscription = await db.calendarSubscription.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // If requested, delete all synced events from this subscription
      if (deleteEvents) {
        await db.calendarEvent.deleteMany({
          where: {
            subscriptionId: id,
            isSynced: true,
          },
        });
      } else {
        // Otherwise, just remove the sync association but keep events
        await db.calendarEvent.updateMany({
          where: {
            subscriptionId: id,
            isSynced: true,
          },
          data: {
            isSynced: false,
            subscriptionId: null,
            externalId: null,
            syncedAt: null,
          },
        });
      }

      await db.calendarSubscription.delete({
        where: { id },
      });

      return { success: true };
    },
    {
      auth: true,
      params: t.Object({
        id: t.String(),
      }),
      query: t.Object({
        deleteEvents: t.Optional(t.Boolean()),
      }),
      detail: {
        tags: ['Calendar Subscriptions'],
        summary: 'Delete calendar subscription',
        description: 'Deletes a subscription. If deleteEvents is true, also deletes all synced events. Otherwise, events are kept but lose their sync association.',
      },
    }
  )
  
  .post(
    '/subscriptions/:id/sync',
    async ({ params, user }: any) => {
      const { id } = params;

      const subscription = await db.calendarSubscription.findFirst({
        where: {
          id,
          userId: user.id,
        },
        include: {
          calendar: true,
        },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const syncResult = await syncCalendarSubscription(subscription);
      return syncResult;
    },
    {
      auth: true,
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ['Calendar Subscriptions'],
        summary: 'Manually trigger subscription sync',
      },
    }
  )
  
  .post(
    '/subscriptions/import-ics',
    async ({ body, user }: any) => {
      const { calendarId, icsContent, fileName } = body;

      // Verify calendar belongs to user
      const calendar = await db.calendar.findFirst({
        where: {
          id: calendarId,
          userId: user.id,
        },
      });

      if (!calendar) {
        throw new Error('Calendar not found or not owned by user');
      }

      const parseResult = parseICSFile(icsContent);
      
      if (parseResult.events.length === 0) {
        throw new Error('No valid events found in ICS file');
      }

      const createdEvents = [];
      const errors = [...parseResult.errors];

      for (const parsedEvent of parseResult.events) {
        try {
          // Check if event with same external ID already exists in this calendar
          const existingEvent = await db.calendarEvent.findFirst({
            where: {
              calendarId,
              externalId: parsedEvent.uid,
              isSynced: false, // Only check manually imported events
            },
          });

          if (existingEvent) {
            errors.push(`Event "${parsedEvent.title}" with UID ${parsedEvent.uid} already exists in calendar`);
            continue;
          }

          const eventData = convertParsedEventToCalendarEvent(
            parsedEvent,
            user.id,
            calendarId
            // No subscriptionId for manual import
          );

          const createdEvent = await db.calendarEvent.create({
            data: eventData,
          });

          createdEvents.push(createdEvent);
        } catch (error) {
          errors.push(`Failed to create event "${parsedEvent.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return {
        success: true,
        eventsCreated: createdEvents.length,
        eventsTotal: parseResult.events.length,
        fileName: fileName || 'unknown.ics',
        calendarName: parseResult.calendarName,
        errors: errors.length > 0 ? errors : undefined,
      };
    },
    {
      auth: true,
      body: t.Object({
        calendarId: t.String(),
        icsContent: t.String(),
        fileName: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Calendar Subscriptions'],
        summary: 'Import ICS file manually',
        description: 'Manually imports events from an ICS file content into a specific calendar.',
      },
    }
  );

// Sync function for individual subscription
export async function syncCalendarSubscription(subscription: any) {
  const syncLog = await db.calendarSyncLog.create({
    data: {
      subscriptionId: subscription.id,
      status: 'started',
    },
  });

  const startTime = Date.now();

  try {
    // Fetch the calendar
    const response = await fetch(subscription.url, {
      headers: {
        'User-Agent': 'Calendar Sync Service/1.0',
        ...(subscription.etag && { 'If-None-Match': subscription.etag }),
        ...(subscription.lastModified && { 'If-Modified-Since': subscription.lastModified }),
      },
    });

    // Handle 304 Not Modified
    if (response.status === 304) {
      await db.calendarSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'success',
          completedAt: new Date(),
          syncDurationMs: Date.now() - startTime,
          httpStatusCode: 304,
        },
      });

      await db.calendarSubscription.update({
        where: { id: subscription.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'success',
          lastErrorMessage: null,
        },
      });

      return { status: 'success', message: 'Calendar not modified, no sync needed' };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const icsContent = await response.text();
    const parseResult = parseICSFile(icsContent);

    let eventsAdded = 0;
    let eventsUpdated = 0;
    let eventsDeleted = 0;

    // Get current synced events for this subscription
    const currentEvents = await db.calendarEvent.findMany({
      where: {
        subscriptionId: subscription.id,
        isSynced: true,
      },
    });

    const currentEventsByUid = new Map(
      currentEvents.map(event => [event.externalId!, event])
    );

    const newEventUids = new Set(parseResult.events.map(event => event.uid));

    // Process new/updated events
    for (const parsedEvent of parseResult.events) {
      const existingEvent = currentEventsByUid.get(parsedEvent.uid);

      if (!existingEvent) {
        // Create new event
        const eventData = convertParsedEventToCalendarEvent(
          parsedEvent,
          subscription.userId,
          subscription.calendarId,
          subscription.id
        );

        await db.calendarEvent.create({ data: eventData });
        eventsAdded++;
      } else if (isEventModified(existingEvent, parsedEvent)) {
        // Update existing event
        await db.calendarEvent.update({
          where: { id: existingEvent.id },
          data: {
            title: parsedEvent.title,
            description: parsedEvent.description,
            start: parsedEvent.start,
            end: parsedEvent.end,
            allDay: parsedEvent.allDay,
            location: parsedEvent.location,
            recurrence: parsedEvent.recurrence,
            syncedAt: new Date(),
          },
        });
        eventsUpdated++;
      }
    }

    // Delete events that no longer exist in the external calendar
    for (const [uid, event] of currentEventsByUid) {
      if (!newEventUids.has(uid)) {
        await db.calendarEvent.delete({
          where: { id: event.id },
        });
        eventsDeleted++;
      }
    }

    // Update subscription
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');

    await db.calendarSubscription.update({
      where: { id: subscription.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastErrorMessage: null,
        etag,
        lastModified,
      },
    });

    // Complete sync log
    await db.calendarSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'success',
        eventsAdded,
        eventsUpdated,
        eventsDeleted,
        completedAt: new Date(),
        syncDurationMs: Date.now() - startTime,
        httpStatusCode: response.status,
      },
    });

    return {
      status: 'success',
      eventsAdded,
      eventsUpdated,
      eventsDeleted,
      errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await db.calendarSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'error',
        errorMessage,
        completedAt: new Date(),
        syncDurationMs: Date.now() - startTime,
      },
    });

    await db.calendarSubscription.update({
      where: { id: subscription.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'error',
        lastErrorMessage: errorMessage,
      },
    });

    throw error;
  }
}