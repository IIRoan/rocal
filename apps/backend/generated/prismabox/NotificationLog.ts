import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const NotificationLogPlain = t.Object(
  {
    id: t.String(),
    eventId: t.String(),
    userId: t.String(),
    notificationType: t.String(),
    minutesBefore: t.Integer(),
    sentAt: t.Date(),
    status: t.String(),
    createdAt: t.Date(),
  },
  { additionalProperties: false },
);

export const NotificationLogRelations = t.Object(
  {},
  { additionalProperties: false },
);

export const NotificationLogPlainInputCreate = t.Object(
  {
    notificationType: t.String(),
    minutesBefore: t.Integer(),
    sentAt: t.Date(),
    status: t.Optional(t.String()),
  },
  { additionalProperties: false },
);

export const NotificationLogPlainInputUpdate = t.Object(
  {
    notificationType: t.Optional(t.String()),
    minutesBefore: t.Optional(t.Integer()),
    sentAt: t.Optional(t.Date()),
    status: t.Optional(t.String()),
  },
  { additionalProperties: false },
);

export const NotificationLogRelationsInputCreate = t.Object(
  {},
  { additionalProperties: false },
);

export const NotificationLogRelationsInputUpdate = t.Partial(
  t.Object({}, { additionalProperties: false }),
);

export const NotificationLogWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          eventId: t.String(),
          userId: t.String(),
          notificationType: t.String(),
          minutesBefore: t.Integer(),
          sentAt: t.Date(),
          status: t.String(),
          createdAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "NotificationLog" },
  ),
);

export const NotificationLogWhereUnique = t.Recursive(
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
              userId: t.String(),
              notificationType: t.String(),
              minutesBefore: t.Integer(),
              sentAt: t.Date(),
              status: t.String(),
              createdAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "NotificationLog" },
);

export const NotificationLogSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      eventId: t.Boolean(),
      userId: t.Boolean(),
      notificationType: t.Boolean(),
      minutesBefore: t.Boolean(),
      sentAt: t.Boolean(),
      status: t.Boolean(),
      createdAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const NotificationLogInclude = t.Partial(
  t.Object({ _count: t.Boolean() }, { additionalProperties: false }),
);

export const NotificationLogOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      eventId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      notificationType: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      minutesBefore: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      sentAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      status: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      createdAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
    },
    { additionalProperties: false },
  ),
);

export const NotificationLog = t.Composite(
  [NotificationLogPlain, NotificationLogRelations],
  { additionalProperties: false },
);

export const NotificationLogInputCreate = t.Composite(
  [NotificationLogPlainInputCreate, NotificationLogRelationsInputCreate],
  { additionalProperties: false },
);

export const NotificationLogInputUpdate = t.Composite(
  [NotificationLogPlainInputUpdate, NotificationLogRelationsInputUpdate],
  { additionalProperties: false },
);
