import { t } from "elysia";
import { __nullable__ } from "./__nullable__";
export const EventCategoryPlain = t.Object({
    id: t.String(),
    name: t.String(),
    color: t.String(),
    isActive: t.Boolean(),
    userId: t.String(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
}, { additionalProperties: false });
export const EventCategoryRelations = t.Object({
    user: t.Object({
        id: t.String(),
        name: t.String(),
        email: t.String(),
        emailVerified: t.Boolean(),
        image: __nullable__(t.String()),
        createdAt: t.Date(),
        updatedAt: t.Date(),
    }, { additionalProperties: false }),
    events: t.Array(t.Object({
        id: t.String(),
        title: t.String(),
        description: __nullable__(t.String()),
        start: t.Date(),
        end: t.Date(),
        allDay: t.Boolean(),
        location: __nullable__(t.String()),
        color: __nullable__(t.String()),
        timezone: t.String(),
        isPrivate: t.Boolean(),
        reminder: __nullable__(t.Integer()),
        recurrence: __nullable__(t.String()),
        parentEventId: __nullable__(t.String()),
        isSynced: t.Boolean(),
        externalId: __nullable__(t.String()),
        subscriptionId: __nullable__(t.String()),
        syncedAt: __nullable__(t.Date()),
        userId: t.String(),
        calendarId: t.String(),
        categoryId: __nullable__(t.String()),
        createdAt: t.Date(),
        updatedAt: t.Date(),
    }, { additionalProperties: false }), { additionalProperties: false }),
}, { additionalProperties: false });
export const EventCategoryPlainInputCreate = t.Object({ name: t.String(), color: t.String(), isActive: t.Optional(t.Boolean()) }, { additionalProperties: false });
export const EventCategoryPlainInputUpdate = t.Object({
    name: t.Optional(t.String()),
    color: t.Optional(t.String()),
    isActive: t.Optional(t.Boolean()),
}, { additionalProperties: false });
export const EventCategoryRelationsInputCreate = t.Object({
    user: t.Object({
        connect: t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }),
    }, { additionalProperties: false }),
    events: t.Optional(t.Object({
        connect: t.Array(t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }), { additionalProperties: false }),
    }, { additionalProperties: false })),
}, { additionalProperties: false });
export const EventCategoryRelationsInputUpdate = t.Partial(t.Object({
    user: t.Object({
        connect: t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }),
    }, { additionalProperties: false }),
    events: t.Partial(t.Object({
        connect: t.Array(t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }), { additionalProperties: false }),
        disconnect: t.Array(t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }), { additionalProperties: false }),
    }, { additionalProperties: false })),
}, { additionalProperties: false }));
export const EventCategoryWhere = t.Partial(t.Recursive((Self) => t.Object({
    AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
    NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
    OR: t.Array(Self, { additionalProperties: false }),
    id: t.String(),
    name: t.String(),
    color: t.String(),
    isActive: t.Boolean(),
    userId: t.String(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
}, { additionalProperties: false }), { $id: "EventCategory" }));
export const EventCategoryWhereUnique = t.Recursive((Self) => t.Intersect([
    t.Partial(t.Object({
        id: t.String(),
        userId_name: t.Object({ userId: t.String(), name: t.String() }, { additionalProperties: false }),
    }, { additionalProperties: false }), { additionalProperties: false }),
    t.Union([
        t.Object({ id: t.String() }),
        t.Object({
            userId_name: t.Object({ userId: t.String(), name: t.String() }, { additionalProperties: false }),
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
        color: t.String(),
        isActive: t.Boolean(),
        userId: t.String(),
        createdAt: t.Date(),
        updatedAt: t.Date(),
    }, { additionalProperties: false })),
], { additionalProperties: false }), { $id: "EventCategory" });
export const EventCategorySelect = t.Partial(t.Object({
    id: t.Boolean(),
    name: t.Boolean(),
    color: t.Boolean(),
    isActive: t.Boolean(),
    userId: t.Boolean(),
    user: t.Boolean(),
    events: t.Boolean(),
    createdAt: t.Boolean(),
    updatedAt: t.Boolean(),
    _count: t.Boolean(),
}, { additionalProperties: false }));
export const EventCategoryInclude = t.Partial(t.Object({ user: t.Boolean(), events: t.Boolean(), _count: t.Boolean() }, { additionalProperties: false }));
export const EventCategoryOrderBy = t.Partial(t.Object({
    id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    name: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    color: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    isActive: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    createdAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    updatedAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
}, { additionalProperties: false }));
export const EventCategory = t.Composite([EventCategoryPlain, EventCategoryRelations], { additionalProperties: false });
export const EventCategoryInputCreate = t.Composite([EventCategoryPlainInputCreate, EventCategoryRelationsInputCreate], { additionalProperties: false });
export const EventCategoryInputUpdate = t.Composite([EventCategoryPlainInputUpdate, EventCategoryRelationsInputUpdate], { additionalProperties: false });
