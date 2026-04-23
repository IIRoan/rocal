import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const EventParticipantPlain = t.Object(
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
);

export const EventParticipantRelations = t.Object(
  {
    event: t.Object(
      {
        id: t.String(),
        title: t.String(),
        description: __nullable__(t.String()),
        encryptedContent: __nullable__(t.String()),
        blindIndexTokens: __nullable__(t.String()),
        encryptionState: t.String(),
        encryptionKeyVersion: t.Integer(),
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
    ),
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
  },
  { additionalProperties: false },
);

export const EventParticipantPlainInputCreate = t.Object(
  { status: t.Optional(t.String()), role: t.Optional(t.String()) },
  { additionalProperties: false },
);

export const EventParticipantPlainInputUpdate = t.Object(
  { status: t.Optional(t.String()), role: t.Optional(t.String()) },
  { additionalProperties: false },
);

export const EventParticipantRelationsInputCreate = t.Object(
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
  },
  { additionalProperties: false },
);

export const EventParticipantRelationsInputUpdate = t.Partial(
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
    },
    { additionalProperties: false },
  ),
);

export const EventParticipantWhere = t.Partial(
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
          status: t.String(),
          role: t.String(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "EventParticipant" },
  ),
);

export const EventParticipantWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            {
              id: t.String(),
              eventId_userId: t.Object(
                { eventId: t.String(), userId: t.String() },
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
              eventId_userId: t.Object(
                { eventId: t.String(), userId: t.String() },
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
              eventId: t.String(),
              userId: t.String(),
              status: t.String(),
              role: t.String(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "EventParticipant" },
);

export const EventParticipantSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      eventId: t.Boolean(),
      event: t.Boolean(),
      userId: t.Boolean(),
      user: t.Boolean(),
      status: t.Boolean(),
      role: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const EventParticipantInclude = t.Partial(
  t.Object(
    { event: t.Boolean(), user: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const EventParticipantOrderBy = t.Partial(
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
      status: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      role: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const EventParticipant = t.Composite(
  [EventParticipantPlain, EventParticipantRelations],
  { additionalProperties: false },
);

export const EventParticipantInputCreate = t.Composite(
  [EventParticipantPlainInputCreate, EventParticipantRelationsInputCreate],
  { additionalProperties: false },
);

export const EventParticipantInputUpdate = t.Composite(
  [EventParticipantPlainInputUpdate, EventParticipantRelationsInputUpdate],
  { additionalProperties: false },
);
