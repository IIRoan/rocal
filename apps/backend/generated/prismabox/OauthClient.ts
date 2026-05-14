import { t } from "elysia";

import { __transformDate__ } from "./__transformDate__";

import { __nullable__ } from "./__nullable__";

export const OauthClientPlain = t.Object(
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
);

export const OauthClientRelations = t.Object(
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
    refreshTokens: t.Array(
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
    consents: t.Array(
      t.Object(
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
      ),
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const OauthClientPlainInputCreate = t.Object(
  {
    clientSecret: t.Optional(__nullable__(t.String())),
    disabled: t.Optional(t.Boolean()),
    skipConsent: t.Optional(__nullable__(t.Boolean())),
    enableEndSession: t.Optional(__nullable__(t.Boolean())),
    subjectType: t.Optional(__nullable__(t.String())),
    scopes: t.Optional(t.Array(t.String(), { additionalProperties: false })),
    name: t.Optional(__nullable__(t.String())),
    uri: t.Optional(__nullable__(t.String())),
    icon: t.Optional(__nullable__(t.String())),
    contacts: t.Optional(t.Array(t.String(), { additionalProperties: false })),
    tos: t.Optional(__nullable__(t.String())),
    policy: t.Optional(__nullable__(t.String())),
    softwareVersion: t.Optional(__nullable__(t.String())),
    softwareStatement: t.Optional(__nullable__(t.String())),
    redirectUris: t.Array(t.String(), { additionalProperties: false }),
    postLogoutRedirectUris: t.Optional(
      t.Array(t.String(), { additionalProperties: false }),
    ),
    tokenEndpointAuthMethod: t.Optional(__nullable__(t.String())),
    grantTypes: t.Optional(
      t.Array(t.String(), { additionalProperties: false }),
    ),
    responseTypes: t.Optional(
      t.Array(t.String(), { additionalProperties: false }),
    ),
    public: t.Optional(__nullable__(t.Boolean())),
    type: t.Optional(__nullable__(t.String())),
    requirePKCE: t.Optional(__nullable__(t.Boolean())),
    metadata: t.Optional(__nullable__(t.Any())),
  },
  { additionalProperties: false },
);

export const OauthClientPlainInputUpdate = t.Object(
  {
    clientSecret: t.Optional(__nullable__(t.String())),
    disabled: t.Optional(t.Boolean()),
    skipConsent: t.Optional(__nullable__(t.Boolean())),
    enableEndSession: t.Optional(__nullable__(t.Boolean())),
    subjectType: t.Optional(__nullable__(t.String())),
    scopes: t.Optional(t.Array(t.String(), { additionalProperties: false })),
    name: t.Optional(__nullable__(t.String())),
    uri: t.Optional(__nullable__(t.String())),
    icon: t.Optional(__nullable__(t.String())),
    contacts: t.Optional(t.Array(t.String(), { additionalProperties: false })),
    tos: t.Optional(__nullable__(t.String())),
    policy: t.Optional(__nullable__(t.String())),
    softwareVersion: t.Optional(__nullable__(t.String())),
    softwareStatement: t.Optional(__nullable__(t.String())),
    redirectUris: t.Optional(
      t.Array(t.String(), { additionalProperties: false }),
    ),
    postLogoutRedirectUris: t.Optional(
      t.Array(t.String(), { additionalProperties: false }),
    ),
    tokenEndpointAuthMethod: t.Optional(__nullable__(t.String())),
    grantTypes: t.Optional(
      t.Array(t.String(), { additionalProperties: false }),
    ),
    responseTypes: t.Optional(
      t.Array(t.String(), { additionalProperties: false }),
    ),
    public: t.Optional(__nullable__(t.Boolean())),
    type: t.Optional(__nullable__(t.String())),
    requirePKCE: t.Optional(__nullable__(t.Boolean())),
    metadata: t.Optional(__nullable__(t.Any())),
  },
  { additionalProperties: false },
);

export const OauthClientRelationsInputCreate = t.Object(
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
    refreshTokens: t.Optional(
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
    consents: t.Optional(
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

export const OauthClientRelationsInputUpdate = t.Partial(
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
      refreshTokens: t.Partial(
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
      consents: t.Partial(
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

export const OauthClientWhere = t.Partial(
  t.Recursive(
    (Self) =>
      t.Object(
        {
          AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
          OR: t.Array(Self, { additionalProperties: false }),
          id: t.String(),
          clientId: t.String(),
          clientSecret: t.String(),
          disabled: t.Boolean(),
          skipConsent: t.Boolean(),
          enableEndSession: t.Boolean(),
          subjectType: t.String(),
          scopes: t.Array(t.String(), { additionalProperties: false }),
          userId: t.String(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
          name: t.String(),
          uri: t.String(),
          icon: t.String(),
          contacts: t.Array(t.String(), { additionalProperties: false }),
          tos: t.String(),
          policy: t.String(),
          softwareId: t.String(),
          softwareVersion: t.String(),
          softwareStatement: t.String(),
          redirectUris: t.Array(t.String(), { additionalProperties: false }),
          postLogoutRedirectUris: t.Array(t.String(), {
            additionalProperties: false,
          }),
          tokenEndpointAuthMethod: t.String(),
          grantTypes: t.Array(t.String(), { additionalProperties: false }),
          responseTypes: t.Array(t.String(), { additionalProperties: false }),
          public: t.Boolean(),
          type: t.String(),
          requirePKCE: t.Boolean(),
          referenceId: t.String(),
          metadata: t.Any(),
        },
        { additionalProperties: false },
      ),
    { $id: "OauthClient" },
  ),
);

export const OauthClientWhereUnique = t.Recursive(
  (Self) =>
    t.Intersect(
      [
        t.Partial(
          t.Object(
            { id: t.String(), clientId: t.String() },
            { additionalProperties: false },
          ),
          { additionalProperties: false },
        ),
        t.Union(
          [t.Object({ id: t.String() }), t.Object({ clientId: t.String() })],
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
              clientId: t.String(),
              clientSecret: t.String(),
              disabled: t.Boolean(),
              skipConsent: t.Boolean(),
              enableEndSession: t.Boolean(),
              subjectType: t.String(),
              scopes: t.Array(t.String(), { additionalProperties: false }),
              userId: t.String(),
              createdAt: t.Date(),
              updatedAt: t.Date(),
              name: t.String(),
              uri: t.String(),
              icon: t.String(),
              contacts: t.Array(t.String(), { additionalProperties: false }),
              tos: t.String(),
              policy: t.String(),
              softwareId: t.String(),
              softwareVersion: t.String(),
              softwareStatement: t.String(),
              redirectUris: t.Array(t.String(), {
                additionalProperties: false,
              }),
              postLogoutRedirectUris: t.Array(t.String(), {
                additionalProperties: false,
              }),
              tokenEndpointAuthMethod: t.String(),
              grantTypes: t.Array(t.String(), { additionalProperties: false }),
              responseTypes: t.Array(t.String(), {
                additionalProperties: false,
              }),
              public: t.Boolean(),
              type: t.String(),
              requirePKCE: t.Boolean(),
              referenceId: t.String(),
              metadata: t.Any(),
            },
            { additionalProperties: false },
          ),
        ),
      ],
      { additionalProperties: false },
    ),
  { $id: "OauthClient" },
);

export const OauthClientSelect = t.Partial(
  t.Object(
    {
      id: t.Boolean(),
      clientId: t.Boolean(),
      clientSecret: t.Boolean(),
      disabled: t.Boolean(),
      skipConsent: t.Boolean(),
      enableEndSession: t.Boolean(),
      subjectType: t.Boolean(),
      scopes: t.Boolean(),
      userId: t.Boolean(),
      user: t.Boolean(),
      createdAt: t.Boolean(),
      updatedAt: t.Boolean(),
      name: t.Boolean(),
      uri: t.Boolean(),
      icon: t.Boolean(),
      contacts: t.Boolean(),
      tos: t.Boolean(),
      policy: t.Boolean(),
      softwareId: t.Boolean(),
      softwareVersion: t.Boolean(),
      softwareStatement: t.Boolean(),
      redirectUris: t.Boolean(),
      postLogoutRedirectUris: t.Boolean(),
      tokenEndpointAuthMethod: t.Boolean(),
      grantTypes: t.Boolean(),
      responseTypes: t.Boolean(),
      public: t.Boolean(),
      type: t.Boolean(),
      requirePKCE: t.Boolean(),
      referenceId: t.Boolean(),
      metadata: t.Boolean(),
      refreshTokens: t.Boolean(),
      accessTokens: t.Boolean(),
      consents: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const OauthClientInclude = t.Partial(
  t.Object(
    {
      user: t.Boolean(),
      refreshTokens: t.Boolean(),
      accessTokens: t.Boolean(),
      consents: t.Boolean(),
      _count: t.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export const OauthClientOrderBy = t.Partial(
  t.Object(
    {
      id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      clientId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      clientSecret: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      disabled: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      skipConsent: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      enableEndSession: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      subjectType: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      scopes: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      createdAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      updatedAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      name: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      uri: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      icon: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      contacts: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      tos: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      policy: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      softwareId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      softwareVersion: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      softwareStatement: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      redirectUris: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      postLogoutRedirectUris: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      tokenEndpointAuthMethod: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      grantTypes: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      responseTypes: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      public: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      type: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      requirePKCE: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      referenceId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
      metadata: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
      }),
    },
    { additionalProperties: false },
  ),
);

export const OauthClient = t.Composite(
  [OauthClientPlain, OauthClientRelations],
  { additionalProperties: false },
);

export const OauthClientInputCreate = t.Composite(
  [OauthClientPlainInputCreate, OauthClientRelationsInputCreate],
  { additionalProperties: false },
);

export const OauthClientInputUpdate = t.Composite(
  [OauthClientPlainInputUpdate, OauthClientRelationsInputUpdate],
  { additionalProperties: false },
);
