import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const RecurrenceExceptionPlain = t.Object(
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
);

export const RecurrenceExceptionRelations = t.Object(
  {
    modifiedEvent: __nullable__(
      t.Object(
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
    ),
  },
  { additionalProperties: false },
);

export const RecurrenceExceptionPlainInputCreate = t.Object(
  { exceptionDate: t.Date(), type: t.Optional(t.String()) },
  { additionalProperties: false },
);

export const RecurrenceExceptionPlainInputUpdate = t.Object(
  { exceptionDate: t.Optional(t.Date()), type: t.Optional(t.String()) },
  { additionalProperties: false },
);

export const RecurrenceExceptionRelationsInputCreate = t.Object(
  {
    modifiedEvent: t.Optional(
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
  },
  { additionalProperties: false },
);

export const RecurrenceExceptionRelationsInputUpdate = t.Partial(
  t.Object(
    {
      modifiedEvent: t.Partial(
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
    },
    { additionalProperties: false },
  ),
);

export const RecurrenceExceptionWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          parentEventId: t.String(),
          exceptionDate: t.Date(),
          modifiedEventId: t.String(),
          type: t.String(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "RecurrenceException" },
  ),
);

export const RecurrenceExceptionWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            {
              id: t.String(),
              parentEventId_exceptionDate: t.Object(
                { parentEventId: t.String(), exceptionDate: t.Date() },
                { additionalProperties: false },
              ),
            },
            { additionalProperties: false },
          ),
          { additionalProperties: false },
        ),
        t.Union(
          [
            t.Object({ id: t.String() }),
            t.Object({
              parentEventId_exceptionDate: t.Object(
                { parentEventId: t.String(), exceptionDate: t.Date() },
                { additionalProperties: false },
              ),
            }),
          ],
          { additionalProperties: false },
        ),
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
              parentEventId: t.String(),
              exceptionDate: t.Date(),
              modifiedEventId: t.String(),
              type: t.String(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "RecurrenceException" },
);

export const RecurrenceExceptionSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      parentEventId: t.Boolean(),
      exceptionDate: t.Boolean(),
      modifiedEventId: t.Boolean(),
      modifiedEvent: t.Boolean(),
      type: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const RecurrenceExceptionInclude = t.Partial(
  t.Object(
    { modifiedEvent: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const RecurrenceExceptionOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      parentEventId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      exceptionDate: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      modifiedEventId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      type: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const RecurrenceException = t.Composite(
  [RecurrenceExceptionPlain, RecurrenceExceptionRelations],
  { additionalProperties: false },
);

export const RecurrenceExceptionInputCreate = t.Composite(
  [
    RecurrenceExceptionPlainInputCreate,
    RecurrenceExceptionRelationsInputCreate,
  ],
  { additionalProperties: false },
);

export const RecurrenceExceptionInputUpdate = t.Composite(
  [
    RecurrenceExceptionPlainInputUpdate,
    RecurrenceExceptionRelationsInputUpdate,
  ],
  { additionalProperties: false },
);
