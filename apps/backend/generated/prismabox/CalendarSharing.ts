import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const CalendarSharingPlain = t.Object(
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
);

export const CalendarSharingRelations = t.Object(
  {
    calendar: t.Object(
      {
        id: t.String(),
        name: t.String(),
        encryptedName: __nullable__(t.String()),
        blindIndexTokens: __nullable__(t.String()),
        encryptionState: t.String(),
        encryptionKeyVersion: t.Integer(),
        color: t.String(),
        kind: t.String(),
        isPublic: t.Boolean(),
        isVisible: t.Boolean(),
        isDefault: t.Boolean(),
        isSyncOnly: t.Boolean(),
        icsShareToken: __nullable__(t.String()),
        icsShareEnabled: t.Boolean(),
        userId: t.String(),
        createdAt: t.Date(),
        updatedAt: t.Date(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const CalendarSharingPlainInputCreate = t.Object(
  {
    sharedWith: t.String(),
    sharedBy: t.String(),
    permission: t.Optional(t.String()),
    accepted: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const CalendarSharingPlainInputUpdate = t.Object(
  {
    sharedWith: t.Optional(t.String()),
    sharedBy: t.Optional(t.String()),
    permission: t.Optional(t.String()),
    accepted: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const CalendarSharingRelationsInputCreate = t.Object(
  {
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
  },
  { additionalProperties: false },
);

export const CalendarSharingRelationsInputUpdate = t.Partial(
  t.Object(
    {
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
    },
    { additionalProperties: false },
  ),
);

export const CalendarSharingWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
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
    { $id: "CalendarSharing" },
  ),
);

export const CalendarSharingWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            {
              id: t.String(),
              calendarId_sharedWith: t.Object(
                { calendarId: t.String(), sharedWith: t.String() },
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
              calendarId_sharedWith: t.Object(
                { calendarId: t.String(), sharedWith: t.String() },
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
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "CalendarSharing" },
);

export const CalendarSharingSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      calendarId: t.Boolean(),
      calendar: t.Boolean(),
      sharedWith: t.Boolean(),
      sharedBy: t.Boolean(),
      permission: t.Boolean(),
      accepted: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const CalendarSharingInclude = t.Partial(
  t.Object(
    { calendar: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const CalendarSharingOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      calendarId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      sharedWith: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      sharedBy: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      permission: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      accepted: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const CalendarSharing = t.Composite(
  [CalendarSharingPlain, CalendarSharingRelations],
  { additionalProperties: false },
);

export const CalendarSharingInputCreate = t.Composite(
  [CalendarSharingPlainInputCreate, CalendarSharingRelationsInputCreate],
  { additionalProperties: false },
);

export const CalendarSharingInputUpdate = t.Composite(
  [CalendarSharingPlainInputUpdate, CalendarSharingRelationsInputUpdate],
  { additionalProperties: false },
);
