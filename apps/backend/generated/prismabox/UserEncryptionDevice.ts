import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const UserEncryptionDevicePlain = t.Object(
  {
    id: t.String(),
    userId: t.String(),
    deviceId: t.String(),
    deviceLabel: __nullable__(t.String()),
    publicKey: t.String(),
    publicKeyAlgorithm: t.String(),
    wrappedAccountKey: t.String(),
    wrappedSearchKey: t.String(),
    wrapAlgorithm: t.String(),
    keyVersion: t.Integer(),
    lastSeenAt: t.Date(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);

export const UserEncryptionDeviceRelations = t.Object(
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

export const UserEncryptionDevicePlainInputCreate = t.Object(
  {
    deviceLabel: t.Optional(__nullable__(t.String())),
    publicKey: t.String(),
    publicKeyAlgorithm: t.Optional(t.String()),
    wrappedAccountKey: t.String(),
    wrappedSearchKey: t.String(),
    wrapAlgorithm: t.Optional(t.String()),
    keyVersion: t.Optional(t.Integer()),
    lastSeenAt: t.Optional(t.Date()),
  },
  { additionalProperties: false },
);

export const UserEncryptionDevicePlainInputUpdate = t.Object(
  {
    deviceLabel: t.Optional(__nullable__(t.String())),
    publicKey: t.Optional(t.String()),
    publicKeyAlgorithm: t.Optional(t.String()),
    wrappedAccountKey: t.Optional(t.String()),
    wrappedSearchKey: t.Optional(t.String()),
    wrapAlgorithm: t.Optional(t.String()),
    keyVersion: t.Optional(t.Integer()),
    lastSeenAt: t.Optional(t.Date()),
  },
  { additionalProperties: false },
);

export const UserEncryptionDeviceRelationsInputCreate = t.Object(
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

export const UserEncryptionDeviceRelationsInputUpdate = t.Partial(
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

export const UserEncryptionDeviceWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          userId: t.String(),
          deviceId: t.String(),
          deviceLabel: t.String(),
          publicKey: t.String(),
          publicKeyAlgorithm: t.String(),
          wrappedAccountKey: t.String(),
          wrappedSearchKey: t.String(),
          wrapAlgorithm: t.String(),
          keyVersion: t.Integer(),
          lastSeenAt: t.Date(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "UserEncryptionDevice" },
  ),
);

export const UserEncryptionDeviceWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            {
              id: t.String(),
              userId_deviceId: t.Object(
                { userId: t.String(), deviceId: t.String() },
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
              userId_deviceId: t.Object(
                { userId: t.String(), deviceId: t.String() },
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
              userId: t.String(),
              deviceId: t.String(),
              deviceLabel: t.String(),
              publicKey: t.String(),
              publicKeyAlgorithm: t.String(),
              wrappedAccountKey: t.String(),
              wrappedSearchKey: t.String(),
              wrapAlgorithm: t.String(),
              keyVersion: t.Integer(),
              lastSeenAt: t.Date(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "UserEncryptionDevice" },
);

export const UserEncryptionDeviceSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      userId: t.Boolean(),
      user: t.Boolean(),
      deviceId: t.Boolean(),
      deviceLabel: t.Boolean(),
      publicKey: t.Boolean(),
      publicKeyAlgorithm: t.Boolean(),
      wrappedAccountKey: t.Boolean(),
      wrappedSearchKey: t.Boolean(),
      wrapAlgorithm: t.Boolean(),
      keyVersion: t.Boolean(),
      lastSeenAt: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const UserEncryptionDeviceInclude = t.Partial(
  t.Object(
    { user: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const UserEncryptionDeviceOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      deviceId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      deviceLabel: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      publicKey: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      publicKeyAlgorithm: t.Union([t.Literal("asc"), t.Literal("desc")], {
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
      lastSeenAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const UserEncryptionDevice = t.Composite(
  [UserEncryptionDevicePlain, UserEncryptionDeviceRelations],
  { additionalProperties: false },
);

export const UserEncryptionDeviceInputCreate = t.Composite(
  [
    UserEncryptionDevicePlainInputCreate,
    UserEncryptionDeviceRelationsInputCreate,
  ],
  { additionalProperties: false },
);

export const UserEncryptionDeviceInputUpdate = t.Composite(
  [
    UserEncryptionDevicePlainInputUpdate,
    UserEncryptionDeviceRelationsInputUpdate,
  ],
  { additionalProperties: false },
);
