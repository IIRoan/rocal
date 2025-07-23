import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const CalendarPlain = t.Object(
  {
    id: t.String(),
    name: t.String(),
    color: t.String(),
    isVisible: t.Boolean(),
    isDefault: t.Boolean(),
    userId: t.String(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);

export const CalendarRelations = t.Object(
  {
    user: t.Object(
      {
        id: t.String(),
        name: t.String(),
        email: t.String(),
        emailVerified: t.Boolean(),
        image: __nullable__(t.String()),
        createdAt: t.Date(),
        updatedAt: t.Date(),
      },
      { additionalProperties: false },
    ),
    events: t.Array(
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
          userId: t.String(),
          calendarId: t.String(),
          categoryId: __nullable__(t.String()),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
      { additionalProperties: false },
    ),
    sharedCalendars: t.Array(
      t.Object(
        {
          id: t.String(),
          calendarId: t.String(),
          sharedWith: t.String(),
          sharedBy: t.String(),
          permission: t.String(),
          accepted: t.Boolean(),
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

export const CalendarPlainInputCreate = t.Object(
  {
    name: t.String(),
    color: t.String(),
    isVisible: t.Optional(t.Boolean()),
    isDefault: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const CalendarPlainInputUpdate = t.Object(
  {
    name: t.Optional(t.String()),
    color: t.Optional(t.String()),
    isVisible: t.Optional(t.Boolean()),
    isDefault: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const CalendarRelationsInputCreate = t.Object(
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
    events: t.Optional(
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
    sharedCalendars: t.Optional(
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

export const CalendarRelationsInputUpdate = t.Partial(
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
      events: t.Partial(
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
      sharedCalendars: t.Partial(
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

export const CalendarWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          name: t.String(),
          color: t.String(),
          isVisible: t.Boolean(),
          isDefault: t.Boolean(),
          userId: t.String(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "Calendar" },
  ),
);

export const CalendarWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            {
              id: t.String(),
              userId_name: t.Object(
                { userId: t.String(), name: t.String() },
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
              userId_name: t.Object(
                { userId: t.String(), name: t.String() },
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
              name: t.String(),
              color: t.String(),
              isVisible: t.Boolean(),
              isDefault: t.Boolean(),
              userId: t.String(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "Calendar" },
);

export const CalendarSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      name: t.Boolean(),
      color: t.Boolean(),
      isVisible: t.Boolean(),
      isDefault: t.Boolean(),
      userId: t.Boolean(),
      user: t.Boolean(),
      events: t.Boolean(),
      sharedCalendars: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const CalendarInclude = t.Partial(
  t.Object(
    {
      user: t.Boolean(),
      events: t.Boolean(),
      sharedCalendars: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const CalendarOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      name: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      color: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      isVisible: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      isDefault: t.Union([t.Literal("asc"), t.Literal("desc")], {
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
    },
    { additionalProperties: false },
  ),
);

export const Calendar = t.Composite([CalendarPlain, CalendarRelations], {
  additionalProperties: false,
});

export const CalendarInputCreate = t.Composite(
  [CalendarPlainInputCreate, CalendarRelationsInputCreate],
  { additionalProperties: false },
);

export const CalendarInputUpdate = t.Composite(
  [CalendarPlainInputUpdate, CalendarRelationsInputUpdate],
  { additionalProperties: false },
);
