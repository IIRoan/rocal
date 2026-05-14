import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const MailJmapSyncStatePlain = t.Object(
  {
    id: t.String(),
    directoryEntryId: t.String(),
    stalwartAccountId: t.String(),
    emailState: t.String(),
    mailboxState: t.String(),
    threadState: __nullable__(t.String()),
    lastSyncedAt: __nullable__(t.Date()),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);

export const MailJmapSyncStateRelations = t.Object(
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

export const MailJmapSyncStatePlainInputCreate = t.Object(
  {
    emailState: t.String(),
    mailboxState: t.String(),
    threadState: t.Optional(__nullable__(t.String())),
    lastSyncedAt: t.Optional(__nullable__(t.Date())),
  },
  { additionalProperties: false },
);

export const MailJmapSyncStatePlainInputUpdate = t.Object(
  {
    emailState: t.Optional(t.String()),
    mailboxState: t.Optional(t.String()),
    threadState: t.Optional(__nullable__(t.String())),
    lastSyncedAt: t.Optional(__nullable__(t.Date())),
  },
  { additionalProperties: false },
);

export const MailJmapSyncStateRelationsInputCreate = t.Object(
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

export const MailJmapSyncStateRelationsInputUpdate = t.Partial(
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

export const MailJmapSyncStateWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          directoryEntryId: t.String(),
          stalwartAccountId: t.String(),
          emailState: t.String(),
          mailboxState: t.String(),
          threadState: t.String(),
          lastSyncedAt: t.Date(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "MailJmapSyncState" },
  ),
);

export const MailJmapSyncStateWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            {
              id: t.String(),
              directoryEntryId: t.String(),
              stalwartAccountId: t.String(),
            },
            { additionalProperties: false },
          ),
          { additionalProperties: false },
        ),
        t.Union(
          [
            t.Object({ id: t.String() }),
            t.Object({ directoryEntryId: t.String() }),
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
              directoryEntryId: t.String(),
              stalwartAccountId: t.String(),
              emailState: t.String(),
              mailboxState: t.String(),
              threadState: t.String(),
              lastSyncedAt: t.Date(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "MailJmapSyncState" },
);

export const MailJmapSyncStateSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      directoryEntryId: t.Boolean(),
      directoryEntry: t.Boolean(),
      stalwartAccountId: t.Boolean(),
      emailState: t.Boolean(),
      mailboxState: t.Boolean(),
      threadState: t.Boolean(),
      lastSyncedAt: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const MailJmapSyncStateInclude = t.Partial(
  t.Object(
    { directoryEntry: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const MailJmapSyncStateOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      directoryEntryId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      stalwartAccountId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      emailState: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      mailboxState: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      threadState: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      lastSyncedAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const MailJmapSyncState = t.Composite(
  [MailJmapSyncStatePlain, MailJmapSyncStateRelations],
  { additionalProperties: false },
);

export const MailJmapSyncStateInputCreate = t.Composite(
  [MailJmapSyncStatePlainInputCreate, MailJmapSyncStateRelationsInputCreate],
  { additionalProperties: false },
);

export const MailJmapSyncStateInputUpdate = t.Composite(
  [MailJmapSyncStatePlainInputUpdate, MailJmapSyncStateRelationsInputUpdate],
  { additionalProperties: false },
);
