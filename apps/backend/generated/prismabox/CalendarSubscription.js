import { t } from "elysia";
import { __nullable__ } from "./__nullable__";
export const CalendarSubscriptionPlain = t.Object({
    id: t.String(),
    name: t.String(),
    url: t.String(),
    isActive: t.Boolean(),
    syncIntervalMinutes: t.Integer(),
    lastSyncAt: __nullable__(t.Date()),
    lastSyncStatus: t.String(),
    lastErrorMessage: __nullable__(t.String()),
    etag: __nullable__(t.String()),
    lastModified: __nullable__(t.String()),
    userId: t.String(),
    calendarId: t.String(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
}, { additionalProperties: false });
export const CalendarSubscriptionRelations = t.Object({
    user: t.Object({
        id: t.String(),
        name: t.String(),
        email: t.String(),
        emailVerified: t.Boolean(),
        image: __nullable__(t.String()),
        createdAt: t.Date(),
        updatedAt: t.Date(),
    }, { additionalProperties: false }),
    calendar: t.Object({
        id: t.String(),
        name: t.String(),
        color: t.String(),
        isVisible: t.Boolean(),
        isDefault: t.Boolean(),
        userId: t.String(),
        createdAt: t.Date(),
        updatedAt: t.Date(),
    }, { additionalProperties: false }),
    syncLogs: t.Array(t.Object({
        id: t.String(),
        subscriptionId: t.String(),
        status: t.String(),
        eventsAdded: t.Integer(),
        eventsUpdated: t.Integer(),
        eventsDeleted: t.Integer(),
        errorMessage: __nullable__(t.String()),
        syncDurationMs: __nullable__(t.Integer()),
        httpStatusCode: __nullable__(t.Integer()),
        startedAt: t.Date(),
        completedAt: __nullable__(t.Date()),
    }, { additionalProperties: false }), { additionalProperties: false }),
}, { additionalProperties: false });
export const CalendarSubscriptionPlainInputCreate = t.Object({
    name: t.String(),
    url: t.String(),
    isActive: t.Optional(t.Boolean()),
    syncIntervalMinutes: t.Optional(t.Integer()),
    lastSyncAt: t.Optional(__nullable__(t.Date())),
    lastSyncStatus: t.Optional(t.String()),
    lastErrorMessage: t.Optional(__nullable__(t.String())),
    etag: t.Optional(__nullable__(t.String())),
    lastModified: t.Optional(__nullable__(t.String())),
}, { additionalProperties: false });
export const CalendarSubscriptionPlainInputUpdate = t.Object({
    name: t.Optional(t.String()),
    url: t.Optional(t.String()),
    isActive: t.Optional(t.Boolean()),
    syncIntervalMinutes: t.Optional(t.Integer()),
    lastSyncAt: t.Optional(__nullable__(t.Date())),
    lastSyncStatus: t.Optional(t.String()),
    lastErrorMessage: t.Optional(__nullable__(t.String())),
    etag: t.Optional(__nullable__(t.String())),
    lastModified: t.Optional(__nullable__(t.String())),
}, { additionalProperties: false });
export const CalendarSubscriptionRelationsInputCreate = t.Object({
    user: t.Object({
        connect: t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }),
    }, { additionalProperties: false }),
    calendar: t.Object({
        connect: t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }),
    }, { additionalProperties: false }),
    syncLogs: t.Optional(t.Object({
        connect: t.Array(t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }), { additionalProperties: false }),
    }, { additionalProperties: false })),
}, { additionalProperties: false });
export const CalendarSubscriptionRelationsInputUpdate = t.Partial(t.Object({
    user: t.Object({
        connect: t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }),
    }, { additionalProperties: false }),
    calendar: t.Object({
        connect: t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }),
    }, { additionalProperties: false }),
    syncLogs: t.Partial(t.Object({
        connect: t.Array(t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }), { additionalProperties: false }),
        disconnect: t.Array(t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }), { additionalProperties: false }),
    }, { additionalProperties: false })),
}, { additionalProperties: false }));
export const CalendarSubscriptionWhere = t.Partial(t.Recursive((Self) => t.Object({
    AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
    NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
    OR: t.Array(Self, { additionalProperties: false }),
    id: t.String(),
    name: t.String(),
    url: t.String(),
    isActive: t.Boolean(),
    syncIntervalMinutes: t.Integer(),
    lastSyncAt: t.Date(),
    lastSyncStatus: t.String(),
    lastErrorMessage: t.String(),
    etag: t.String(),
    lastModified: t.String(),
    userId: t.String(),
    calendarId: t.String(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
}, { additionalProperties: false }), { $id: "CalendarSubscription" }));
export const CalendarSubscriptionWhereUnique = t.Recursive((Self) => t.Intersect([
    t.Partial(t.Object({
        id: t.String(),
        userId_url: t.Object({ userId: t.String(), url: t.String() }, { additionalProperties: false }),
    }, { additionalProperties: false }), { additionalProperties: false }),
    t.Union([
        t.Object({ id: t.String() }),
        t.Object({
            userId_url: t.Object({ userId: t.String(), url: t.String() }, { additionalProperties: false }),
        }),
    ], { additionalProperties: false }),
    t.Partial(t.Object({
        AND: t.Union([
            Self,
            t.Array(Self, { additionalProperties: false }),
        ]),
        NOT: t.Union([
            Self,
            t.Array(Self, { additionalProperties: false }),
        ]),
        OR: t.Array(Self, { additionalProperties: false }),
    }), { additionalProperties: false }),
    t.Partial(t.Object({
        id: t.String(),
        name: t.String(),
        url: t.String(),
        isActive: t.Boolean(),
        syncIntervalMinutes: t.Integer(),
        lastSyncAt: t.Date(),
        lastSyncStatus: t.String(),
        lastErrorMessage: t.String(),
        etag: t.String(),
        lastModified: t.String(),
        userId: t.String(),
        calendarId: t.String(),
        createdAt: t.Date(),
        updatedAt: t.Date(),
    }, { additionalProperties: false })),
], { additionalProperties: false }), { $id: "CalendarSubscription" });
export const CalendarSubscriptionSelect = t.Partial(t.Object({
    id: t.Boolean(),
    name: t.Boolean(),
    url: t.Boolean(),
    isActive: t.Boolean(),
    syncIntervalMinutes: t.Boolean(),
    lastSyncAt: t.Boolean(),
    lastSyncStatus: t.Boolean(),
    lastErrorMessage: t.Boolean(),
    etag: t.Boolean(),
    lastModified: t.Boolean(),
    userId: t.Boolean(),
    user: t.Boolean(),
    calendarId: t.Boolean(),
    calendar: t.Boolean(),
    syncLogs: t.Boolean(),
    createdAt: t.Boolean(),
    updatedAt: t.Boolean(),
    _count: t.Boolean(),
}, { additionalProperties: false }));
export const CalendarSubscriptionInclude = t.Partial(t.Object({
    user: t.Boolean(),
    calendar: t.Boolean(),
    syncLogs: t.Boolean(),
    _count: t.Boolean(),
}, { additionalProperties: false }));
export const CalendarSubscriptionOrderBy = t.Partial(t.Object({
    id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    name: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    url: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    isActive: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    syncIntervalMinutes: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    lastSyncAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    lastSyncStatus: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    lastErrorMessage: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    etag: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    lastModified: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    calendarId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    createdAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    updatedAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
}, { additionalProperties: false }));
export const CalendarSubscription = t.Composite([CalendarSubscriptionPlain, CalendarSubscriptionRelations], { additionalProperties: false });
export const CalendarSubscriptionInputCreate = t.Composite([
    CalendarSubscriptionPlainInputCreate,
    CalendarSubscriptionRelationsInputCreate,
], { additionalProperties: false });
export const CalendarSubscriptionInputUpdate = t.Composite([
    CalendarSubscriptionPlainInputUpdate,
    CalendarSubscriptionRelationsInputUpdate,
], { additionalProperties: false });
