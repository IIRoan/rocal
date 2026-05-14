import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const JwksPlain = t.Object(
  {
    id: t.String(),
    publicKey: t.String(),
    privateKey: t.String(),
    createdAt: t.Date(),
    expiresAt: __nullable__(t.Date()),
    alg: __nullable__(t.String()),
    crv: __nullable__(t.String()),
  },
  { additionalProperties: false },
);

export const JwksRelations = t.Object({}, { additionalProperties: false });

export const JwksPlainInputCreate = t.Object(
  {
    publicKey: t.String(),
    privateKey: t.String(),
    expiresAt: t.Optional(__nullable__(t.Date())),
    alg: t.Optional(__nullable__(t.String())),
    crv: t.Optional(__nullable__(t.String())),
  },
  { additionalProperties: false },
);

export const JwksPlainInputUpdate = t.Object(
  {
    publicKey: t.Optional(t.String()),
    privateKey: t.Optional(t.String()),
    expiresAt: t.Optional(__nullable__(t.Date())),
    alg: t.Optional(__nullable__(t.String())),
    crv: t.Optional(__nullable__(t.String())),
  },
  { additionalProperties: false },
);

export const JwksRelationsInputCreate = t.Object(
  {},
  { additionalProperties: false },
);

export const JwksRelationsInputUpdate = t.Partial(
  t.Object({}, { additionalProperties: false }),
);

export const JwksWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          publicKey: t.String(),
          privateKey: t.String(),
          createdAt: t.Date(),
          expiresAt: t.Date(),
          alg: t.String(),
          crv: t.String(),
        },
        { additionalProperties: false },
      ),
    { $id: "Jwks" },
  ),
);

export const JwksWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object({ id: t.String() }, { additionalProperties: false }),
          { additionalProperties: false },
        ),
        t.Union([t.Object({ id: t.String() })], {
          additionalProperties: false,
        }),
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
              publicKey: t.String(),
              privateKey: t.String(),
              createdAt: t.Date(),
              expiresAt: t.Date(),
              alg: t.String(),
              crv: t.String(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "Jwks" },
);

export const JwksSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      publicKey: t.Boolean(),
      privateKey: t.Boolean(),
      createdAt: t.Boolean(),
      expiresAt: t.Boolean(),
      alg: t.Boolean(),
      crv: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const JwksInclude = t.Partial(
  t.Object({ _count: t.Boolean() }, { additionalProperties: false }),
);

export const JwksOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      publicKey: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      privateKey: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      createdAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      expiresAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      alg: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      crv: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
    },
    { additionalProperties: false },
  ),
);

export const Jwks = t.Composite([JwksPlain, JwksRelations], {
  additionalProperties: false,
});

export const JwksInputCreate = t.Composite(
  [JwksPlainInputCreate, JwksRelationsInputCreate],
  { additionalProperties: false },
);

export const JwksInputUpdate = t.Composite(
  [JwksPlainInputUpdate, JwksRelationsInputUpdate],
  { additionalProperties: false },
);
