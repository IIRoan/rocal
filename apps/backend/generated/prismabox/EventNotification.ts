import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const EventNotificationPlain = t.Object(
  {
    id: t.String(),
    eventId: t.String(),
    notificationType: t.String(),
    minutesBefore: t.Integer(),
    notificationTime: t.Date(),
    isEnabled: t.Boolean(),
    isSent: t.Boolean(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);

export const EventNotificationRelations = t.Object(
  {
    event: t.Object(
      {
        id: t.String(),
        title: t.String(),
        description: __nullable__(t.String()),
        start: t.Date(),
        end: t.Date(),
        allDay: t.Boolean(),
        location: __nullable__(t.String()),
        color: __nullable__(t.String()),
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
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const EventNotificationPlainInputCreate = t.Object(
  {
    notificationType: t.String(),
    minutesBefore: t.Integer(),
    notificationTime: t.Date(),
    isEnabled: t.Optional(t.Boolean()),
    isSent: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const EventNotificationPlainInputUpdate = t.Object(
  {
    notificationType: t.Optional(t.String()),
    minutesBefore: t.Optional(t.Integer()),
    notificationTime: t.Optional(t.Date()),
    isEnabled: t.Optional(t.Boolean()),
    isSent: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const EventNotificationRelationsInputCreate = t.Object(
  {
    event: t.Object(
      {
        connect: t.Object(
          {
            id: t.String({ additionalProperties: false }),
          },
          { additionalProperties: false },
        ),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const EventNotificationRelationsInputUpdate = t.Partial(
  t.Object(
    {
      event: t.Object(
        {
          connect: t.Object(
            {
              id: t.String({ additionalProperties: false }),
            },
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
);

export const EventNotificationWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          eventId: t.String(),
          notificationType: t.String(),
          minutesBefore: t.Integer(),
          notificationTime: t.Date(),
          isEnabled: t.Boolean(),
          isSent: t.Boolean(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "EventNotification" },
  ),
);

export const EventNotificationWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object({ id: t.String() }, { additionalProperties: false }),
          { additionalProperties: false },
        ),
        t.Union([t.Object({ id: t.String() })], {
          additionalProperties: false,
        }),
        t.Partial(
          t.Object({
            AND: t.Union([
              Self,
              t.Array(Self, { additionalProperties: false }),
            ]),
            NOT: t.Union([
              Self,
              t.Array(Self, { additionalProperties: false }),
            ]),
            OR: t.Array(Self, { additionalProperties: false }),
          }),
          { additionalProperties: false },
        ),
        t.Partial(
          t.Object(
            {
              id: t.String(),
              eventId: t.String(),
              notificationType: t.String(),
              minutesBefore: t.Integer(),
              notificationTime: t.Date(),
              isEnabled: t.Boolean(),
              isSent: t.Boolean(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "EventNotification" },
);

export const EventNotificationSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      eventId: t.Boolean(),
      event: t.Boolean(),
      notificationType: t.Boolean(),
      minutesBefore: t.Boolean(),
      notificationTime: t.Boolean(),
      isEnabled: t.Boolean(),
      isSent: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const EventNotificationInclude = t.Partial(
  t.Object(
    { event: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const EventNotificationOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      eventId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      notificationType: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      minutesBefore: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      notificationTime: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      isEnabled: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      isSent: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      createdAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      updatedAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
    },
    { additionalProperties: false },
  ),
);

export const EventNotification = t.Composite(
  [EventNotificationPlain, EventNotificationRelations],
  { additionalProperties: false },
);

export const EventNotificationInputCreate = t.Composite(
  [EventNotificationPlainInputCreate, EventNotificationRelationsInputCreate],
  { additionalProperties: false },
);

export const EventNotificationInputUpdate = t.Composite(
  [EventNotificationPlainInputUpdate, EventNotificationRelationsInputUpdate],
  { additionalProperties: false },
);
