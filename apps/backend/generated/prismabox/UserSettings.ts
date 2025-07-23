import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const UserSettingsPlain = t.Object(
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
);

export const UserSettingsRelations = t.Object(
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
  },
  { additionalProperties: false },
);

export const UserSettingsPlainInputCreate = t.Object(
  {
    theme: t.Optional(t.String()),
    defaultView: t.Optional(t.String()),
    weekStartDay: t.Optional(t.Integer()),
    timezone: t.Optional(t.String()),
    timeFormat: t.Optional(t.String()),
    workingHoursStart: t.Optional(t.Integer()),
    workingHoursEnd: t.Optional(t.Integer()),
    workingDays: t.Optional(t.String()),
    emailNotifications: t.Optional(t.Boolean()),
    browserNotifications: t.Optional(t.Boolean()),
    reminderSound: t.Optional(t.Boolean()),
    defaultReminder: t.Optional(__nullable__(t.Integer())),
    defaultEventDuration: t.Optional(t.Integer()),
    compactView: t.Optional(t.Boolean()),
    showWeekNumbers: t.Optional(t.Boolean()),
    showDeclinedEvents: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const UserSettingsPlainInputUpdate = t.Object(
  {
    theme: t.Optional(t.String()),
    defaultView: t.Optional(t.String()),
    weekStartDay: t.Optional(t.Integer()),
    timezone: t.Optional(t.String()),
    timeFormat: t.Optional(t.String()),
    workingHoursStart: t.Optional(t.Integer()),
    workingHoursEnd: t.Optional(t.Integer()),
    workingDays: t.Optional(t.String()),
    emailNotifications: t.Optional(t.Boolean()),
    browserNotifications: t.Optional(t.Boolean()),
    reminderSound: t.Optional(t.Boolean()),
    defaultReminder: t.Optional(__nullable__(t.Integer())),
    defaultEventDuration: t.Optional(t.Integer()),
    compactView: t.Optional(t.Boolean()),
    showWeekNumbers: t.Optional(t.Boolean()),
    showDeclinedEvents: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const UserSettingsRelationsInputCreate = t.Object(
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
  },
  { additionalProperties: false },
);

export const UserSettingsRelationsInputUpdate = t.Partial(
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
    },
    { additionalProperties: false },
  ),
);

export const UserSettingsWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
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
          defaultReminder: t.Integer(),
          defaultEventDuration: t.Integer(),
          defaultCalendarId: t.String(),
          compactView: t.Boolean(),
          showWeekNumbers: t.Boolean(),
          showDeclinedEvents: t.Boolean(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "UserSettings" },
  ),
);

export const UserSettingsWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            { id: t.String(), userId: t.String() },
            { additionalProperties: false },
          ),
          { additionalProperties: false },
        ),
        t.Union(
          [t.Object({ id: t.String() }), t.Object({ userId: t.String() })],
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
              defaultReminder: t.Integer(),
              defaultEventDuration: t.Integer(),
              defaultCalendarId: t.String(),
              compactView: t.Boolean(),
              showWeekNumbers: t.Boolean(),
              showDeclinedEvents: t.Boolean(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "UserSettings" },
);

export const UserSettingsSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      userId: t.Boolean(),
      user: t.Boolean(),
      theme: t.Boolean(),
      defaultView: t.Boolean(),
      weekStartDay: t.Boolean(),
      timezone: t.Boolean(),
      timeFormat: t.Boolean(),
      workingHoursStart: t.Boolean(),
      workingHoursEnd: t.Boolean(),
      workingDays: t.Boolean(),
      emailNotifications: t.Boolean(),
      browserNotifications: t.Boolean(),
      reminderSound: t.Boolean(),
      defaultReminder: t.Boolean(),
      defaultEventDuration: t.Boolean(),
      defaultCalendarId: t.Boolean(),
      compactView: t.Boolean(),
      showWeekNumbers: t.Boolean(),
      showDeclinedEvents: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const UserSettingsInclude = t.Partial(
  t.Object(
    { user: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const UserSettingsOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      theme: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      defaultView: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      weekStartDay: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      timezone: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      timeFormat: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      workingHoursStart: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      workingHoursEnd: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      workingDays: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      emailNotifications: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      browserNotifications: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      reminderSound: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      defaultReminder: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      defaultEventDuration: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      defaultCalendarId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      compactView: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      showWeekNumbers: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      showDeclinedEvents: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const UserSettings = t.Composite(
  [UserSettingsPlain, UserSettingsRelations],
  { additionalProperties: false },
);

export const UserSettingsInputCreate = t.Composite(
  [UserSettingsPlainInputCreate, UserSettingsRelationsInputCreate],
  { additionalProperties: false },
);

export const UserSettingsInputUpdate = t.Composite(
  [UserSettingsPlainInputUpdate, UserSettingsRelationsInputUpdate],
  { additionalProperties: false },
);
