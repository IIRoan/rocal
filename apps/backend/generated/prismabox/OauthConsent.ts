import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const OauthConsentPlain = t.Object(
  {
    id: t.String(),
    clientId: t.String(),
    userId: __nullable__(t.String()),
    referenceId: __nullable__(t.String()),
    scopes: t.Array(t.String(), { additionalProperties: false }),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);

export const OauthConsentRelations = t.Object(
  {
    client: t.Object(
      {
        id: t.String(),
        clientId: t.String(),
        clientSecret: __nullable__(t.String()),
        disabled: t.Boolean(),
        skipConsent: __nullable__(t.Boolean()),
        enableEndSession: __nullable__(t.Boolean()),
        subjectType: __nullable__(t.String()),
        scopes: t.Array(t.String(), { additionalProperties: false }),
        userId: __nullable__(t.String()),
        createdAt: t.Date(),
        updatedAt: t.Date(),
        name: __nullable__(t.String()),
        uri: __nullable__(t.String()),
        icon: __nullable__(t.String()),
        contacts: t.Array(t.String(), { additionalProperties: false }),
        tos: __nullable__(t.String()),
        policy: __nullable__(t.String()),
        softwareId: __nullable__(t.String()),
        softwareVersion: __nullable__(t.String()),
        softwareStatement: __nullable__(t.String()),
        redirectUris: t.Array(t.String(), { additionalProperties: false }),
        postLogoutRedirectUris: t.Array(t.String(), {
          additionalProperties: false,
        }),
        tokenEndpointAuthMethod: __nullable__(t.String()),
        grantTypes: t.Array(t.String(), { additionalProperties: false }),
        responseTypes: t.Array(t.String(), { additionalProperties: false }),
        public: __nullable__(t.Boolean()),
        type: __nullable__(t.String()),
        requirePKCE: __nullable__(t.Boolean()),
        referenceId: __nullable__(t.String()),
        metadata: __nullable__(t.Any()),
      },
      { additionalProperties: false },
    ),
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
  },
  { additionalProperties: false },
);

export const OauthConsentPlainInputCreate = t.Object(
  { scopes: t.Optional(t.Array(t.String(), { additionalProperties: false })) },
  { additionalProperties: false },
);

export const OauthConsentPlainInputUpdate = t.Object(
  { scopes: t.Optional(t.Array(t.String(), { additionalProperties: false })) },
  { additionalProperties: false },
);

export const OauthConsentRelationsInputCreate = t.Object(
  {
    client: t.Object(
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
  },
  { additionalProperties: false },
);

export const OauthConsentRelationsInputUpdate = t.Partial(
  t.Object(
    {
      client: t.Object(
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
    },
    { additionalProperties: false },
  ),
);

export const OauthConsentWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          clientId: t.String(),
          userId: t.String(),
          referenceId: t.String(),
          scopes: t.Array(t.String(), { additionalProperties: false }),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    { $id: "OauthConsent" },
  ),
);

export const OauthConsentWhereUnique = t.Recursive(
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
              clientId: t.String(),
              userId: t.String(),
              referenceId: t.String(),
              scopes: t.Array(t.String(), { additionalProperties: false }),
              createdAt: t.Date(),
              updatedAt: t.Date(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "OauthConsent" },
);

export const OauthConsentSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      clientId: t.Boolean(),
      client: t.Boolean(),
      userId: t.Boolean(),
      user: t.Boolean(),
      referenceId: t.Boolean(),
      scopes: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const OauthConsentInclude = t.Partial(
  t.Object(
    { client: t.Boolean(), user: t.Boolean(), _count: t.Boolean() },
    { additionalProperties: false },
  ),
);

export const OauthConsentOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      clientId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      referenceId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      scopes: t.Union([t.Literal("asc"), t.Literal("desc")], {
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

export const OauthConsent = t.Composite(
  [OauthConsentPlain, OauthConsentRelations],
  { additionalProperties: false },
);

export const OauthConsentInputCreate = t.Composite(
  [OauthConsentPlainInputCreate, OauthConsentRelationsInputCreate],
  { additionalProperties: false },
);

export const OauthConsentInputUpdate = t.Composite(
  [OauthConsentPlainInputUpdate, OauthConsentRelationsInputUpdate],
  { additionalProperties: false },
);
