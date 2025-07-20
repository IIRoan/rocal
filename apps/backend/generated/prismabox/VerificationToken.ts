import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const VerificationTokenPlain = t.Object(
  {
    id: t.String(),
    identifier: t.String(),
    token: t.String(),
    expires: t.Date(),
  },
  { additionalProperties: false },
);

export const VerificationTokenRelations = t.Object(
  {},
  { additionalProperties: false },
);

export const VerificationTokenPlainInputCreate = t.Object(
  { identifier: t.String(), token: t.String(), expires: t.Date() },
  { additionalProperties: false },
);

export const VerificationTokenPlainInputUpdate = t.Object(
  {
    identifier: t.Optional(t.String()),
    token: t.Optional(t.String()),
    expires: t.Optional(t.Date()),
  },
  { additionalProperties: false },
);

export const VerificationTokenRelationsInputCreate = t.Object(
  {},
  { additionalProperties: false },
);

export const VerificationTokenRelationsInputUpdate = t.Partial(
  t.Object({}, { additionalProperties: false }),
);

export const VerificationTokenWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          identifier: t.String(),
          token: t.String(),
          expires: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "VerificationToken" },
  ),
);

export const VerificationTokenWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            {
              id: t.String(),
              identifier_token: t.Object(
                { identifier: t.String(), token: t.String() },
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
              identifier_token: t.Object(
                { identifier: t.String(), token: t.String() },
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
              identifier: t.String(),
              token: t.String(),
              expires: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "VerificationToken" },
);

export const VerificationTokenSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      identifier: t.Boolean(),
      token: t.Boolean(),
      expires: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const VerificationTokenInclude = t.Partial(
  t.Object({ _count: t.Boolean() }, { additionalProperties: false }),
);

export const VerificationTokenOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      identifier: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      token: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      expires: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
    },
    { additionalProperties: false },
  ),
);

export const VerificationToken = t.Composite(
  [VerificationTokenPlain, VerificationTokenRelations],
  { additionalProperties: false },
);

export const VerificationTokenInputCreate = t.Composite(
  [VerificationTokenPlainInputCreate, VerificationTokenRelationsInputCreate],
  { additionalProperties: false },
);

export const VerificationTokenInputUpdate = t.Composite(
  [VerificationTokenPlainInputUpdate, VerificationTokenRelationsInputUpdate],
  { additionalProperties: false },
);
