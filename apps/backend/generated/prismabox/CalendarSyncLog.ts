import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const CalendarSyncLogPlain = t.Object(
  {
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
  },
  { additionalProperties: false },
);

export const CalendarSyncLogRelations = t.Object(
  {
    subscription: t.Object(
      {
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
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const CalendarSyncLogPlainInputCreate = t.Object(
  {
    status: t.Optional(t.String()),
    eventsAdded: t.Optional(t.Integer()),
    eventsUpdated: t.Optional(t.Integer()),
    eventsDeleted: t.Optional(t.Integer()),
    errorMessage: t.Optional(__nullable__(t.String())),
    syncDurationMs: t.Optional(__nullable__(t.Integer())),
    httpStatusCode: t.Optional(__nullable__(t.Integer())),
    startedAt: t.Optional(t.Date()),
    completedAt: t.Optional(__nullable__(t.Date())),
  },
  { additionalProperties: false },
);

export const CalendarSyncLogPlainInputUpdate = t.Object(
  {
    status: t.Optional(t.String()),
    eventsAdded: t.Optional(t.Integer()),
    eventsUpdated: t.Optional(t.Integer()),
    eventsDeleted: t.Optional(t.Integer()),
    errorMessage: t.Optional(__nullable__(t.String())),
    syncDurationMs: t.Optional(__nullable__(t.Integer())),
    httpStatusCode: t.Optional(__nullable__(t.Integer())),
    startedAt: t.Optional(t.Date()),
    completedAt: t.Optional(__nullable__(t.Date())),
  },
  { additionalProperties: false },
);

export const CalendarSyncLogRelationsInputCreate = t.Object(
  {
    subscription: t.Object(
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

export const CalendarSyncLogRelationsInputUpdate = t.Partial(
  t.Object(
    {
      subscription: t.Object(
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

export const CalendarSyncLogWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          subscriptionId: t.String(),
          status: t.String(),
          eventsAdded: t.Integer(),
          eventsUpdated: t.Integer(),
          eventsDeleted: t.Integer(),
          errorMessage: t.String(),
          syncDurationMs: t.Integer(),
          httpStatusCode: t.Integer(),
          startedAt: t.Date(),
          completedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "CalendarSyncLog" },
  ),
);

export const CalendarSyncLogWhereUnique = t.Recursive(
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
              subscriptionId: t.String(),
              status: t.String(),
              eventsAdded: t.Integer(),
              eventsUpdated: t.Integer(),
              eventsDeleted: t.Integer(),
              errorMessage: t.String(),
              syncDurationMs: t.Integer(),
              httpStatusCode: t.Integer(),
              startedAt: t.Date(),
              completedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "CalendarSyncLog" },
);

export const CalendarSyncLogSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      subscriptionId: t.Boolean(),
      subscription: t.Boolean(),
      status: t.Boolean(),
      eventsAdded: t.Boolean(),
      eventsUpdated: t.Boolean(),
      eventsDeleted: t.Boolean(),
      errorMessage: t.Boolean(),
      syncDurationMs: t.Boolean(),
      httpStatusCode: t.Boolean(),
      startedAt: t.Boolean(),
      completedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const CalendarSyncLogInclude = t.Partial(
  t.Object(
    { subscription: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const CalendarSyncLogOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      subscriptionId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      status: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      eventsAdded: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      eventsUpdated: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      eventsDeleted: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      errorMessage: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      syncDurationMs: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      httpStatusCode: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      startedAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      completedAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
    },
    { additionalProperties: false },
  ),
);

export const CalendarSyncLog = t.Composite(
  [CalendarSyncLogPlain, CalendarSyncLogRelations],
  { additionalProperties: false },
);

export const CalendarSyncLogInputCreate = t.Composite(
  [CalendarSyncLogPlainInputCreate, CalendarSyncLogRelationsInputCreate],
  { additionalProperties: false },
);

export const CalendarSyncLogInputUpdate = t.Composite(
  [CalendarSyncLogPlainInputUpdate, CalendarSyncLogRelationsInputUpdate],
  { additionalProperties: false },
);
