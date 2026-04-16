import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const UserPlain = t.Object(
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
);

export const UserRelations = t.Object(
  {
    sessions: t.Array(
      t.Object(
        {
          id: t.String(),
          expiresAt: t.Date(),
          token: t.String(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
          ipAddress: __nullable__(t.String()),
          userAgent: __nullable__(t.String()),
          userId: t.String(),
        },
        { additionalProperties: false },
      ),
      { additionalProperties: false },
    ),
    accounts: t.Array(
      t.Object(
        {
          id: t.String(),
          accountId: t.String(),
          providerId: t.String(),
          userId: t.String(),
          accessToken: __nullable__(t.String()),
          refreshToken: __nullable__(t.String()),
          idToken: __nullable__(t.String()),
          accessTokenExpiresAt: __nullable__(t.Date()),
          refreshTokenExpiresAt: __nullable__(t.Date()),
          scope: __nullable__(t.String()),
          password: __nullable__(t.String()),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
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
      { additionalProperties: false },
    ),
    categories: t.Array(
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
      { additionalProperties: false },
    ),
    calendars: t.Array(
      t.Object(
        {
          id: t.String(),
          name: t.String(),
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
      { additionalProperties: false },
    ),
    participations: t.Array(
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
    settings: __nullable__(
      t.Object(
        {
          id: t.String(),
          userId: t.String(),
          theme: t.String(),
          defaultView: t.String(),
          weekStartDay: t.Integer(),
          timezone: t.String(),
          timeFormat: t.String(),
          workingHoursStart: t.Integer(),
          workingHoursEnd: t.Integer(),
          workingDays: t.String(),
          emailNotifications: t.Boolean(),
          browserNotifications: t.Boolean(),
          reminderSound: t.Boolean(),
          defaultReminder: __nullable__(t.Integer()),
          defaultEventDuration: t.Integer(),
          defaultCalendarId: __nullable__(t.String()),
          compactView: t.Boolean(),
          showWeekNumbers: t.Boolean(),
          showDeclinedEvents: t.Boolean(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    ),
    subscriptions: t.Array(
      t.Object(
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
      { additionalProperties: false },
    ),
    passkeys: t.Array(
      t.Object(
        {
          id: t.String(),
          name: __nullable__(t.String()),
          publicKey: t.String(),
          userId: t.String(),
          credentialID: t.String(),
          counter: t.Integer(),
          deviceType: t.String(),
          backedUp: t.Boolean(),
          transports: __nullable__(t.String()),
          createdAt: __nullable__(t.Date()),
          aaguid: __nullable__(t.String()),
        },
        { additionalProperties: false },
      ),
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const UserPlainInputCreate = t.Object(
  {
    name: t.String(),
    email: t.String(),
    emailVerified: t.Optional(t.Boolean()),
    image: t.Optional(__nullable__(t.String())),
    hasAiAccess: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const UserPlainInputUpdate = t.Object(
  {
    name: t.Optional(t.String()),
    email: t.Optional(t.String()),
    emailVerified: t.Optional(t.Boolean()),
    image: t.Optional(__nullable__(t.String())),
    hasAiAccess: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const UserRelationsInputCreate = t.Object(
  {
    sessions: t.Optional(
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
    accounts: t.Optional(
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
    categories: t.Optional(
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
    calendars: t.Optional(
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
    participations: t.Optional(
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
    settings: t.Optional(
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
    subscriptions: t.Optional(
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
    passkeys: t.Optional(
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

export const UserRelationsInputUpdate = t.Partial(
  t.Object(
    {
      sessions: t.Partial(
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
      accounts: t.Partial(
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
      categories: t.Partial(
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
      calendars: t.Partial(
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
      participations: t.Partial(
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
      settings: t.Partial(
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
      subscriptions: t.Partial(
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
      passkeys: t.Partial(
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

export const UserWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          name: t.String(),
          email: t.String(),
          emailVerified: t.Boolean(),
          image: t.String(),
          hasAiAccess: t.Boolean(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "User" },
  ),
);

export const UserWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            { id: t.String(), email: t.String() },
            { additionalProperties: false },
          ),
          { additionalProperties: false },
        ),
        t.Union(
          [t.Object({ id: t.String() }), t.Object({ email: t.String() })],
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
              email: t.String(),
              emailVerified: t.Boolean(),
              image: t.String(),
              hasAiAccess: t.Boolean(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "User" },
);

export const UserSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      name: t.Boolean(),
      email: t.Boolean(),
      emailVerified: t.Boolean(),
      image: t.Boolean(),
      hasAiAccess: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      sessions: t.Boolean(),
      accounts: t.Boolean(),
      events: t.Boolean(),
      categories: t.Boolean(),
      calendars: t.Boolean(),
      participations: t.Boolean(),
      settings: t.Boolean(),
      subscriptions: t.Boolean(),
      passkeys: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const UserInclude = t.Partial(
  t.Object(
    {
      sessions: t.Boolean(),
      accounts: t.Boolean(),
      events: t.Boolean(),
      categories: t.Boolean(),
      calendars: t.Boolean(),
      participations: t.Boolean(),
      settings: t.Boolean(),
      subscriptions: t.Boolean(),
      passkeys: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const UserOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      name: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      email: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      emailVerified: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      image: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      hasAiAccess: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const User = t.Composite([UserPlain, UserRelations], {
  additionalProperties: false,
});

export const UserInputCreate = t.Composite(
  [UserPlainInputCreate, UserRelationsInputCreate],
  { additionalProperties: false },
);

export const UserInputUpdate = t.Composite(
  [UserPlainInputUpdate, UserRelationsInputUpdate],
  { additionalProperties: false },
);
