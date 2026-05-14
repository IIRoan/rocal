import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const OauthAccessTokenPlain = t.Object(
  {
    id: t.String(),
    token: t.String(),
    clientId: t.String(),
    sessionId: __nullable__(t.String()),
    userId: __nullable__(t.String()),
    referenceId: __nullable__(t.String()),
    refreshId: __nullable__(t.String()),
    expiresAt: t.Date(),
    createdAt: t.Date(),
    scopes: t.Array(t.String(), { additionalProperties: false }),
  },
  { additionalProperties: false },
);

export const OauthAccessTokenRelations = t.Object(
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
    session: __nullable__(
      t.Object(
        {
          id: t.String(),
          expiresAt: t.Date(),
          token: t.String(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
          ipAddress: __nullable__(t.String()),
          userAgent: __nullable__(t.String()),
          userId: t.String(),
        },
        { additionalProperties: false },
      ),
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
    refresh: __nullable__(
      t.Object(
        {
          id: t.String(),
          token: t.String(),
          clientId: t.String(),
          sessionId: __nullable__(t.String()),
          userId: t.String(),
          referenceId: __nullable__(t.String()),
          expiresAt: t.Date(),
          createdAt: t.Date(),
          revoked: __nullable__(t.Date()),
          authTime: __nullable__(t.Date()),
          scopes: t.Array(t.String(), { additionalProperties: false }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const OauthAccessTokenPlainInputCreate = t.Object(
  {
    token: t.String(),
    expiresAt: t.Date(),
    scopes: t.Optional(t.Array(t.String(), { additionalProperties: false })),
  },
  { additionalProperties: false },
);

export const OauthAccessTokenPlainInputUpdate = t.Object(
  {
    token: t.Optional(t.String()),
    expiresAt: t.Optional(t.Date()),
    scopes: t.Optional(t.Array(t.String(), { additionalProperties: false })),
  },
  { additionalProperties: false },
);

export const OauthAccessTokenRelationsInputCreate = t.Object(
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
    session: t.Optional(
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
    refresh: t.Optional(
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

export const OauthAccessTokenRelationsInputUpdate = t.Partial(
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
      session: t.Partial(
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
      refresh: t.Partial(
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

export const OauthAccessTokenWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          token: t.String(),
          clientId: t.String(),
          sessionId: t.String(),
          userId: t.String(),
          referenceId: t.String(),
          refreshId: t.String(),
          expiresAt: t.Date(),
          createdAt: t.Date(),
          scopes: t.Array(t.String(), { additionalProperties: false }),
        },
        { additionalProperties: false },
      ),
    { $id: "OauthAccessToken" },
  ),
);

export const OauthAccessTokenWhereUnique = t.Recursive(
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
              clientId: t.String(),
              sessionId: t.String(),
              userId: t.String(),
              referenceId: t.String(),
              refreshId: t.String(),
              expiresAt: t.Date(),
              createdAt: t.Date(),
              scopes: t.Array(t.String(), { additionalProperties: false }),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "OauthAccessToken" },
);

export const OauthAccessTokenSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      token: t.Boolean(),
      clientId: t.Boolean(),
      client: t.Boolean(),
      sessionId: t.Boolean(),
      session: t.Boolean(),
      userId: t.Boolean(),
      user: t.Boolean(),
      referenceId: t.Boolean(),
      refreshId: t.Boolean(),
      refresh: t.Boolean(),
      expiresAt: t.Boolean(),
      createdAt: t.Boolean(),
      scopes: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const OauthAccessTokenInclude = t.Partial(
  t.Object(
    {
      client: t.Boolean(),
      session: t.Boolean(),
      user: t.Boolean(),
      refresh: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const OauthAccessTokenOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      token: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      clientId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      sessionId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      referenceId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      refreshId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      expiresAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      createdAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      scopes: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
    },
    { additionalProperties: false },
  ),
);

export const OauthAccessToken = t.Composite(
  [OauthAccessTokenPlain, OauthAccessTokenRelations],
  { additionalProperties: false },
);

export const OauthAccessTokenInputCreate = t.Composite(
  [OauthAccessTokenPlainInputCreate, OauthAccessTokenRelationsInputCreate],
  { additionalProperties: false },
);

export const OauthAccessTokenInputUpdate = t.Composite(
  [OauthAccessTokenPlainInputUpdate, OauthAccessTokenRelationsInputUpdate],
  { additionalProperties: false },
);
