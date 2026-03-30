import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const CalendarEventPlain = t.Object(
  {
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
  },
  { additionalProperties: false },
);

export const CalendarEventRelations = t.Object(
  {
    user: t.Object(
      {
        id: t.String(),
        name: t.String(),
        email: t.String(),
        emailVerified: t.Boolean(),
        image: __nullable__(t.String()),
        hasAiAccess: t.Boolean(),
        createdAt: t.Date(),
        updatedAt: t.Date(),
      },
      { additionalProperties: false },
    ),
    calendar: t.Object(
      {
        id: t.String(),
        name: t.String(),
        color: t.String(),
        isVisible: t.Boolean(),
        isDefault: t.Boolean(),
        icsShareToken: __nullable__(t.String()),
        icsShareEnabled: t.Boolean(),
        userId: t.String(),
        createdAt: t.Date(),
        updatedAt: t.Date(),
      },
      { additionalProperties: false },
    ),
    category: __nullable__(
      t.Object(
        {
          id: t.String(),
          name: t.String(),
          color: t.String(),
          isActive: t.Boolean(),
          userId: t.String(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    ),
    participants: t.Array(
      t.Object(
        {
          id: t.String(),
          eventId: t.String(),
          userId: t.String(),
          status: t.String(),
          role: t.String(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
      { additionalProperties: false },
    ),
    recurrenceExceptions: t.Array(
      t.Object(
        {
          id: t.String(),
          parentEventId: t.String(),
          exceptionDate: t.Date(),
          modifiedEventId: __nullable__(t.String()),
          type: t.String(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
      { additionalProperties: false },
    ),
    notifications: t.Array(
      t.Object(
        {
          id: t.String(),
          eventId: t.String(),
          notificationType: t.String(),
          minutesBefore: t.Integer(),
          notificationTime: t.Date(),
          notificationDateLocal: t.String(),
          notificationTimezone: t.String(),
          isEnabled: t.Boolean(),
          isSent: t.Boolean(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const CalendarEventPlainInputCreate = t.Object(
  {
    title: t.String(),
    description: t.Optional(__nullable__(t.String())),
    start: t.Date(),
    end: t.Date(),
    allDay: t.Optional(t.Boolean()),
    location: t.Optional(__nullable__(t.String())),
    color: t.Optional(__nullable__(t.String())),
    timezone: t.Optional(t.String()),
    isPrivate: t.Optional(t.Boolean()),
    reminder: t.Optional(__nullable__(t.Integer())),
    recurrence: t.Optional(__nullable__(t.String())),
    isSynced: t.Optional(t.Boolean()),
    syncedAt: t.Optional(__nullable__(t.Date())),
  },
  { additionalProperties: false },
);

export const CalendarEventPlainInputUpdate = t.Object(
  {
    title: t.Optional(t.String()),
    description: t.Optional(__nullable__(t.String())),
    start: t.Optional(t.Date()),
    end: t.Optional(t.Date()),
    allDay: t.Optional(t.Boolean()),
    location: t.Optional(__nullable__(t.String())),
    color: t.Optional(__nullable__(t.String())),
    timezone: t.Optional(t.String()),
    isPrivate: t.Optional(t.Boolean()),
    reminder: t.Optional(__nullable__(t.Integer())),
    recurrence: t.Optional(__nullable__(t.String())),
    isSynced: t.Optional(t.Boolean()),
    syncedAt: t.Optional(__nullable__(t.Date())),
  },
  { additionalProperties: false },
);

export const CalendarEventRelationsInputCreate = t.Object(
  {
    user: t.Object(
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
    calendar: t.Object(
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
    category: t.Optional(
      t.Object(
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
    ),
    participants: t.Optional(
      t.Object(
        {
          connect: t.Array(
            t.Object(
              {
                id: t.String({ additionalProperties: false }),
              },
              { additionalProperties: false },
            ),
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
    ),
    recurrenceExceptions: t.Optional(
      t.Object(
        {
          connect: t.Array(
            t.Object(
              {
                id: t.String({ additionalProperties: false }),
              },
              { additionalProperties: false },
            ),
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
    ),
    notifications: t.Optional(
      t.Object(
        {
          connect: t.Array(
            t.Object(
              {
                id: t.String({ additionalProperties: false }),
              },
              { additionalProperties: false },
            ),
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const CalendarEventRelationsInputUpdate = t.Partial(
  t.Object(
    {
      user: t.Object(
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
      calendar: t.Object(
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
      category: t.Partial(
        t.Object(
          {
            connect: t.Object(
              {
                id: t.String({ additionalProperties: false }),
              },
              { additionalProperties: false },
            ),
            disconnect: t.Boolean(),
          },
          { additionalProperties: false },
        ),
      ),
      participants: t.Partial(
        t.Object(
          {
            connect: t.Array(
              t.Object(
                {
                  id: t.String({ additionalProperties: false }),
                },
                { additionalProperties: false },
              ),
              { additionalProperties: false },
            ),
            disconnect: t.Array(
              t.Object(
                {
                  id: t.String({ additionalProperties: false }),
                },
                { additionalProperties: false },
              ),
              { additionalProperties: false },
            ),
          },
          { additionalProperties: false },
        ),
      ),
      recurrenceExceptions: t.Partial(
        t.Object(
          {
            connect: t.Array(
              t.Object(
                {
                  id: t.String({ additionalProperties: false }),
                },
                { additionalProperties: false },
              ),
              { additionalProperties: false },
            ),
            disconnect: t.Array(
              t.Object(
                {
                  id: t.String({ additionalProperties: false }),
                },
                { additionalProperties: false },
              ),
              { additionalProperties: false },
            ),
          },
          { additionalProperties: false },
        ),
      ),
      notifications: t.Partial(
        t.Object(
          {
            connect: t.Array(
              t.Object(
                {
                  id: t.String({ additionalProperties: false }),
                },
                { additionalProperties: false },
              ),
              { additionalProperties: false },
            ),
            disconnect: t.Array(
              t.Object(
                {
                  id: t.String({ additionalProperties: false }),
                },
                { additionalProperties: false },
              ),
              { additionalProperties: false },
            ),
          },
          { additionalProperties: false },
        ),
      ),
    },
    { additionalProperties: false },
  ),
);

export const CalendarEventWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          title: t.String(),
          description: t.String(),
          start: t.Date(),
          end: t.Date(),
          allDay: t.Boolean(),
          location: t.String(),
          color: t.String(),
          timezone: t.String(),
          isPrivate: t.Boolean(),
          reminder: t.Integer(),
          recurrence: t.String(),
          parentEventId: t.String(),
          isSynced: t.Boolean(),
          externalId: t.String(),
          subscriptionId: t.String(),
          syncedAt: t.Date(),
          userId: t.String(),
          calendarId: t.String(),
          categoryId: t.String(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "CalendarEvent" },
  ),
);

export const CalendarEventWhereUnique = t.Recursive(
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
              title: t.String(),
              description: t.String(),
              start: t.Date(),
              end: t.Date(),
              allDay: t.Boolean(),
              location: t.String(),
              color: t.String(),
              timezone: t.String(),
              isPrivate: t.Boolean(),
              reminder: t.Integer(),
              recurrence: t.String(),
              parentEventId: t.String(),
              isSynced: t.Boolean(),
              externalId: t.String(),
              subscriptionId: t.String(),
              syncedAt: t.Date(),
              userId: t.String(),
              calendarId: t.String(),
              categoryId: t.String(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "CalendarEvent" },
);

export const CalendarEventSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      title: t.Boolean(),
      description: t.Boolean(),
      start: t.Boolean(),
      end: t.Boolean(),
      allDay: t.Boolean(),
      location: t.Boolean(),
      color: t.Boolean(),
      timezone: t.Boolean(),
      isPrivate: t.Boolean(),
      reminder: t.Boolean(),
      recurrence: t.Boolean(),
      parentEventId: t.Boolean(),
      isSynced: t.Boolean(),
      externalId: t.Boolean(),
      subscriptionId: t.Boolean(),
      syncedAt: t.Boolean(),
      userId: t.Boolean(),
      user: t.Boolean(),
      calendarId: t.Boolean(),
      calendar: t.Boolean(),
      categoryId: t.Boolean(),
      category: t.Boolean(),
      participants: t.Boolean(),
      recurrenceExceptions: t.Boolean(),
      notifications: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const CalendarEventInclude = t.Partial(
  t.Object(
    {
      user: t.Boolean(),
      calendar: t.Boolean(),
      category: t.Boolean(),
      participants: t.Boolean(),
      recurrenceExceptions: t.Boolean(),
      notifications: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const CalendarEventOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      title: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      description: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      start: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      end: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      allDay: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      location: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      color: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      timezone: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      isPrivate: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      reminder: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      recurrence: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      parentEventId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      isSynced: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      externalId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      subscriptionId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      syncedAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      calendarId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      categoryId: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const CalendarEvent = t.Composite(
  [CalendarEventPlain, CalendarEventRelations],
  { additionalProperties: false },
);

export const CalendarEventInputCreate = t.Composite(
  [CalendarEventPlainInputCreate, CalendarEventRelationsInputCreate],
  { additionalProperties: false },
);

export const CalendarEventInputUpdate = t.Composite(
  [CalendarEventPlainInputUpdate, CalendarEventRelationsInputUpdate],
  { additionalProperties: false },
);
