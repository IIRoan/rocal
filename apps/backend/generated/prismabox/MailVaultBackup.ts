import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const MailVaultBackupPlain = t.Object(
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
);

export const MailVaultBackupRelations = t.Object(
  {
    directoryEntry: t.Object(
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
    ),
  },
  { additionalProperties: false },
);

export const MailVaultBackupPlainInputCreate = t.Object(
  {
    vaultVersion: t.Integer(),
    encryptedVaultB64: t.String(),
    kdf: t.String(),
    kdfSaltB64: t.String(),
    kdfMemoryKiB: t.Integer(),
    kdfIterations: t.Integer(),
    kdfParallelism: t.Integer(),
  },
  { additionalProperties: false },
);

export const MailVaultBackupPlainInputUpdate = t.Object(
  {
    vaultVersion: t.Optional(t.Integer()),
    encryptedVaultB64: t.Optional(t.String()),
    kdf: t.Optional(t.String()),
    kdfSaltB64: t.Optional(t.String()),
    kdfMemoryKiB: t.Optional(t.Integer()),
    kdfIterations: t.Optional(t.Integer()),
    kdfParallelism: t.Optional(t.Integer()),
  },
  { additionalProperties: false },
);

export const MailVaultBackupRelationsInputCreate = t.Object(
  {
    directoryEntry: t.Object(
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

export const MailVaultBackupRelationsInputUpdate = t.Partial(
  t.Object(
    {
      directoryEntry: t.Object(
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

export const MailVaultBackupWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
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
    { $id: "MailVaultBackup" },
  ),
);

export const MailVaultBackupWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            { id: t.String(), directoryEntryId: t.String() },
            { additionalProperties: false },
          ),
          { additionalProperties: false },
        ),
        t.Union(
          [
            t.Object({ id: t.String() }),
            t.Object({ directoryEntryId: t.String() }),
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
      ],
      { additionalProperties: false },
    ),
  { $id: "MailVaultBackup" },
);

export const MailVaultBackupSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      directoryEntryId: t.Boolean(),
      directoryEntry: t.Boolean(),
      vaultVersion: t.Boolean(),
      encryptedVaultB64: t.Boolean(),
      kdf: t.Boolean(),
      kdfSaltB64: t.Boolean(),
      kdfMemoryKiB: t.Boolean(),
      kdfIterations: t.Boolean(),
      kdfParallelism: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const MailVaultBackupInclude = t.Partial(
  t.Object(
    { directoryEntry: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const MailVaultBackupOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      directoryEntryId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      vaultVersion: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      encryptedVaultB64: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      kdf: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      kdfSaltB64: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      kdfMemoryKiB: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      kdfIterations: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      kdfParallelism: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const MailVaultBackup = t.Composite(
  [MailVaultBackupPlain, MailVaultBackupRelations],
  { additionalProperties: false },
);

export const MailVaultBackupInputCreate = t.Composite(
  [MailVaultBackupPlainInputCreate, MailVaultBackupRelationsInputCreate],
  { additionalProperties: false },
);

export const MailVaultBackupInputUpdate = t.Composite(
  [MailVaultBackupPlainInputUpdate, MailVaultBackupRelationsInputUpdate],
  { additionalProperties: false },
);
