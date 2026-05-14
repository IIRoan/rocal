import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const OauthRefreshTokenPlain = t.Object(
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
);

export const OauthRefreshTokenRelations = t.Object(
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
    accessTokens: t.Array(
      t.Object(
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
      ),
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const OauthRefreshTokenPlainInputCreate = t.Object(
  {
    token: t.String(),
    expiresAt: t.Date(),
    revoked: t.Optional(__nullable__(t.Date())),
    authTime: t.Optional(__nullable__(t.Date())),
    scopes: t.Optional(t.Array(t.String(), { additionalProperties: false })),
  },
  { additionalProperties: false },
);

export const OauthRefreshTokenPlainInputUpdate = t.Object(
  {
    token: t.Optional(t.String()),
    expiresAt: t.Optional(t.Date()),
    revoked: t.Optional(__nullable__(t.Date())),
    authTime: t.Optional(__nullable__(t.Date())),
    scopes: t.Optional(t.Array(t.String(), { additionalProperties: false })),
  },
  { additionalProperties: false },
);

export const OauthRefreshTokenRelationsInputCreate = t.Object(
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
    accessTokens: t.Optional(
      t.Object(
        {
          connect: t.Array(
            t.Object(
              {
                id: t.String({ additionalProperties: false }),
              },
              { additionalProperties: false },
            ),
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const OauthRefreshTokenRelationsInputUpdate = t.Partial(
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
      accessTokens: t.Partial(
        t.Object(
          {
            connect: t.Array(
              t.Object(
                {
                  id: t.String({ additionalProperties: false }),
                },
                { additionalProperties: false },
              ),
              { additionalProperties: false },
            ),
            disconnect: t.Array(
              t.Object(
                {
                  id: t.String({ additionalProperties: false }),
                },
                { additionalProperties: false },
              ),
              { additionalProperties: false },
            ),
          },
          { additionalProperties: false },
        ),
      ),
    },
    { additionalProperties: false },
  ),
);

export const OauthRefreshTokenWhere = t.Partial(
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
          expiresAt: t.Date(),
          createdAt: t.Date(),
          revoked: t.Date(),
          authTime: t.Date(),
          scopes: t.Array(t.String(), { additionalProperties: false }),
        },
        { additionalProperties: false },
      ),
    { $id: "OauthRefreshToken" },
  ),
);

export const OauthRefreshTokenWhereUnique = t.Recursive(
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
              expiresAt: t.Date(),
              createdAt: t.Date(),
              revoked: t.Date(),
              authTime: t.Date(),
              scopes: t.Array(t.String(), { additionalProperties: false }),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "OauthRefreshToken" },
);

export const OauthRefreshTokenSelect = t.Partial(
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
      expiresAt: t.Boolean(),
      createdAt: t.Boolean(),
      revoked: t.Boolean(),
      authTime: t.Boolean(),
      scopes: t.Boolean(),
      accessTokens: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const OauthRefreshTokenInclude = t.Partial(
  t.Object(
    {
      client: t.Boolean(),
      session: t.Boolean(),
      user: t.Boolean(),
      accessTokens: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const OauthRefreshTokenOrderBy = t.Partial(
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
      expiresAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      createdAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      revoked: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      authTime: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      scopes: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
    },
    { additionalProperties: false },
  ),
);

export const OauthRefreshToken = t.Composite(
  [OauthRefreshTokenPlain, OauthRefreshTokenRelations],
  { additionalProperties: false },
);

export const OauthRefreshTokenInputCreate = t.Composite(
  [OauthRefreshTokenPlainInputCreate, OauthRefreshTokenRelationsInputCreate],
  { additionalProperties: false },
);

export const OauthRefreshTokenInputUpdate = t.Composite(
  [OauthRefreshTokenPlainInputUpdate, OauthRefreshTokenRelationsInputUpdate],
  { additionalProperties: false },
);
