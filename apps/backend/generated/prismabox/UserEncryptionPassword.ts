import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const UserEncryptionPasswordPlain = t.Object(
  {
    id: t.String(),
    userId: t.String(),
    kdfAlgorithm: t.String(),
    kdfSalt: t.String(),
    kdfIterations: t.Integer(),
    wrappedAccountKey: t.String(),
    wrappedSearchKey: t.String(),
    wrapAlgorithm: t.String(),
    keyVersion: t.Integer(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);

export const UserEncryptionPasswordRelations = t.Object(
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

export const UserEncryptionPasswordPlainInputCreate = t.Object(
  {
    kdfAlgorithm: t.Optional(t.String()),
    kdfSalt: t.String(),
    kdfIterations: t.Optional(t.Integer()),
    wrappedAccountKey: t.String(),
    wrappedSearchKey: t.String(),
    wrapAlgorithm: t.Optional(t.String()),
    keyVersion: t.Optional(t.Integer()),
  },
  { additionalProperties: false },
);

export const UserEncryptionPasswordPlainInputUpdate = t.Object(
  {
    kdfAlgorithm: t.Optional(t.String()),
    kdfSalt: t.Optional(t.String()),
    kdfIterations: t.Optional(t.Integer()),
    wrappedAccountKey: t.Optional(t.String()),
    wrappedSearchKey: t.Optional(t.String()),
    wrapAlgorithm: t.Optional(t.String()),
    keyVersion: t.Optional(t.Integer()),
  },
  { additionalProperties: false },
);

export const UserEncryptionPasswordRelationsInputCreate = t.Object(
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

export const UserEncryptionPasswordRelationsInputUpdate = t.Partial(
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

export const UserEncryptionPasswordWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          userId: t.String(),
          kdfAlgorithm: t.String(),
          kdfSalt: t.String(),
          kdfIterations: t.Integer(),
          wrappedAccountKey: t.String(),
          wrappedSearchKey: t.String(),
          wrapAlgorithm: t.String(),
          keyVersion: t.Integer(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "UserEncryptionPassword" },
  ),
);

export const UserEncryptionPasswordWhereUnique = t.Recursive(
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
              kdfAlgorithm: t.String(),
              kdfSalt: t.String(),
              kdfIterations: t.Integer(),
              wrappedAccountKey: t.String(),
              wrappedSearchKey: t.String(),
              wrapAlgorithm: t.String(),
              keyVersion: t.Integer(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "UserEncryptionPassword" },
);

export const UserEncryptionPasswordSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      userId: t.Boolean(),
      user: t.Boolean(),
      kdfAlgorithm: t.Boolean(),
      kdfSalt: t.Boolean(),
      kdfIterations: t.Boolean(),
      wrappedAccountKey: t.Boolean(),
      wrappedSearchKey: t.Boolean(),
      wrapAlgorithm: t.Boolean(),
      keyVersion: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const UserEncryptionPasswordInclude = t.Partial(
  t.Object(
    { user: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const UserEncryptionPasswordOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      kdfAlgorithm: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      kdfSalt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      kdfIterations: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      wrappedAccountKey: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      wrappedSearchKey: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      wrapAlgorithm: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      keyVersion: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const UserEncryptionPassword = t.Composite(
  [UserEncryptionPasswordPlain, UserEncryptionPasswordRelations],
  { additionalProperties: false },
);

export const UserEncryptionPasswordInputCreate = t.Composite(
  [
    UserEncryptionPasswordPlainInputCreate,
    UserEncryptionPasswordRelationsInputCreate,
  ],
  { additionalProperties: false },
);

export const UserEncryptionPasswordInputUpdate = t.Composite(
  [
    UserEncryptionPasswordPlainInputUpdate,
    UserEncryptionPasswordRelationsInputUpdate,
  ],
  { additionalProperties: false },
);
