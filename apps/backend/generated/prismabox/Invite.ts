import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const InvitePlain = t.Object(
  {
    id: t.String(),
    token: t.String(),
    invitedById: t.String(),
    email: t.String(),
    status: t.String(),
    expiresAt: t.Date(),
    claimedForEmail: __nullable__(t.String()),
    claimedAt: __nullable__(t.Date()),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);

export const InviteRelations = t.Object(
  {
    invitedBy: t.Object(
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

export const InvitePlainInputCreate = t.Object(
  {
    token: t.Optional(t.String()),
    email: t.String(),
    status: t.Optional(t.String()),
    expiresAt: t.Date(),
    claimedForEmail: t.Optional(__nullable__(t.String())),
    claimedAt: t.Optional(__nullable__(t.Date())),
  },
  { additionalProperties: false },
);

export const InvitePlainInputUpdate = t.Object(
  {
    token: t.Optional(t.String()),
    email: t.Optional(t.String()),
    status: t.Optional(t.String()),
    expiresAt: t.Optional(t.Date()),
    claimedForEmail: t.Optional(__nullable__(t.String())),
    claimedAt: t.Optional(__nullable__(t.Date())),
  },
  { additionalProperties: false },
);

export const InviteRelationsInputCreate = t.Object(
  {
    invitedBy: t.Object(
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

export const InviteRelationsInputUpdate = t.Partial(
  t.Object(
    {
      invitedBy: t.Object(
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

export const InviteWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          token: t.String(),
          invitedById: t.String(),
          email: t.String(),
          status: t.String(),
          expiresAt: t.Date(),
          claimedForEmail: t.String(),
          claimedAt: t.Date(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "Invite" },
  ),
);

export const InviteWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            { id: t.String(), token: t.String() },
            { additionalProperties: false },
          ),
          { additionalProperties: false },
        ),
        t.Union(
          [t.Object({ id: t.String() }), t.Object({ token: t.String() })],
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
              token: t.String(),
              invitedById: t.String(),
              email: t.String(),
              status: t.String(),
              expiresAt: t.Date(),
              claimedForEmail: t.String(),
              claimedAt: t.Date(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "Invite" },
);

export const InviteSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      token: t.Boolean(),
      invitedById: t.Boolean(),
      invitedBy: t.Boolean(),
      email: t.Boolean(),
      status: t.Boolean(),
      expiresAt: t.Boolean(),
      claimedForEmail: t.Boolean(),
      claimedAt: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const InviteInclude = t.Partial(
  t.Object(
    { invitedBy: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const InviteOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      token: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      invitedById: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      email: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      status: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      expiresAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      claimedForEmail: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      claimedAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const Invite = t.Composite([InvitePlain, InviteRelations], {
  additionalProperties: false,
});

export const InviteInputCreate = t.Composite(
  [InvitePlainInputCreate, InviteRelationsInputCreate],
  { additionalProperties: false },
);

export const InviteInputUpdate = t.Composite(
  [InvitePlainInputUpdate, InviteRelationsInputUpdate],
  { additionalProperties: false },
);
