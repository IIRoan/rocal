import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const MailDirectoryEntryPlain = t.Object(
  {
    id: t.String(),
    userId: __nullable__(t.String()),
    email: t.String(),
    localPart: t.String(),
    domain: t.String(),
    displayName: __nullable__(t.String()),
    stalwartAccountId: t.String(),
    stalwartDomainId: t.String(),
    stalwartPublicKeyId: __nullable__(t.String()),
    publicKeyArmored: t.String(),
    publicKeyFingerprint: t.String(),
    keyAlgorithm: t.String(),
    source: t.String(),
    trust: t.String(),
    keyCreatedAt: __nullable__(t.Date()),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);

export const MailDirectoryEntryRelations = t.Object(
  {
    user: __nullable__(
      t.Object(
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
    ),
    vaultBackup: __nullable__(
      t.Object(
        {
          id: t.String(),
          directoryEntryId: t.String(),
          vaultVersion: t.Integer(),
          encryptedVaultB64: t.String(),
          kdf: t.String(),
          kdfSaltB64: t.String(),
          kdfMemoryKiB: t.Integer(),
          kdfIterations: t.Integer(),
          kdfParallelism: t.Integer(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const MailDirectoryEntryPlainInputCreate = t.Object(
  {
    email: t.String(),
    localPart: t.String(),
    domain: t.String(),
    displayName: t.Optional(__nullable__(t.String())),
    publicKeyArmored: t.String(),
    publicKeyFingerprint: t.String(),
    keyAlgorithm: t.Optional(t.String()),
    source: t.Optional(t.String()),
    trust: t.Optional(t.String()),
    keyCreatedAt: t.Optional(__nullable__(t.Date())),
  },
  { additionalProperties: false },
);

export const MailDirectoryEntryPlainInputUpdate = t.Object(
  {
    email: t.Optional(t.String()),
    localPart: t.Optional(t.String()),
    domain: t.Optional(t.String()),
    displayName: t.Optional(__nullable__(t.String())),
    publicKeyArmored: t.Optional(t.String()),
    publicKeyFingerprint: t.Optional(t.String()),
    keyAlgorithm: t.Optional(t.String()),
    source: t.Optional(t.String()),
    trust: t.Optional(t.String()),
    keyCreatedAt: t.Optional(__nullable__(t.Date())),
  },
  { additionalProperties: false },
);

export const MailDirectoryEntryRelationsInputCreate = t.Object(
  {
    user: t.Optional(
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
    vaultBackup: t.Optional(
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

export const MailDirectoryEntryRelationsInputUpdate = t.Partial(
  t.Object(
    {
      user: t.Partial(
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
      vaultBackup: t.Partial(
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

export const MailDirectoryEntryWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          userId: t.String(),
          email: t.String(),
          localPart: t.String(),
          domain: t.String(),
          displayName: t.String(),
          stalwartAccountId: t.String(),
          stalwartDomainId: t.String(),
          stalwartPublicKeyId: t.String(),
          publicKeyArmored: t.String(),
          publicKeyFingerprint: t.String(),
          keyAlgorithm: t.String(),
          source: t.String(),
          trust: t.String(),
          keyCreatedAt: t.Date(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "MailDirectoryEntry" },
  ),
);

export const MailDirectoryEntryWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            {
              id: t.String(),
              userId: t.String(),
              email: t.String(),
              stalwartAccountId: t.String(),
            },
            { additionalProperties: false },
          ),
          { additionalProperties: false },
        ),
        t.Union(
          [
            t.Object({ id: t.String() }),
            t.Object({ userId: t.String() }),
            t.Object({ email: t.String() }),
            t.Object({ stalwartAccountId: t.String() }),
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
              email: t.String(),
              localPart: t.String(),
              domain: t.String(),
              displayName: t.String(),
              stalwartAccountId: t.String(),
              stalwartDomainId: t.String(),
              stalwartPublicKeyId: t.String(),
              publicKeyArmored: t.String(),
              publicKeyFingerprint: t.String(),
              keyAlgorithm: t.String(),
              source: t.String(),
              trust: t.String(),
              keyCreatedAt: t.Date(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "MailDirectoryEntry" },
);

export const MailDirectoryEntrySelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      userId: t.Boolean(),
      user: t.Boolean(),
      email: t.Boolean(),
      localPart: t.Boolean(),
      domain: t.Boolean(),
      displayName: t.Boolean(),
      stalwartAccountId: t.Boolean(),
      stalwartDomainId: t.Boolean(),
      stalwartPublicKeyId: t.Boolean(),
      publicKeyArmored: t.Boolean(),
      publicKeyFingerprint: t.Boolean(),
      keyAlgorithm: t.Boolean(),
      source: t.Boolean(),
      trust: t.Boolean(),
      keyCreatedAt: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      vaultBackup: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const MailDirectoryEntryInclude = t.Partial(
  t.Object(
    { user: t.Boolean(), vaultBackup: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const MailDirectoryEntryOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      email: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      localPart: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      domain: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      displayName: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      stalwartAccountId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      stalwartDomainId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      stalwartPublicKeyId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      publicKeyArmored: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      publicKeyFingerprint: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      keyAlgorithm: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      source: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      trust: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      keyCreatedAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const MailDirectoryEntry = t.Composite(
  [MailDirectoryEntryPlain, MailDirectoryEntryRelations],
  { additionalProperties: false },
);

export const MailDirectoryEntryInputCreate = t.Composite(
  [MailDirectoryEntryPlainInputCreate, MailDirectoryEntryRelationsInputCreate],
  { additionalProperties: false },
);

export const MailDirectoryEntryInputUpdate = t.Composite(
  [MailDirectoryEntryPlainInputUpdate, MailDirectoryEntryRelationsInputUpdate],
  { additionalProperties: false },
);
