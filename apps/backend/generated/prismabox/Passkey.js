import { t } from "elysia";
import { __nullable__ } from "./__nullable__";
export const PasskeyPlain = t.Object({
    id: t.String(),
    name: __nullable__(t.String()),
    publicKey: t.String(),
    userId: t.String(),
    credentialID: t.String(),
    counter: t.Integer(),
    deviceType: t.String(),
    backedUp: t.Boolean(),
    transports: __nullable__(t.String()),
    createdAt: __nullable__(t.Date()),
    aaguid: __nullable__(t.String()),
}, { additionalProperties: false });
export const PasskeyRelations = t.Object({
    user: t.Object({
        id: t.String(),
        name: t.String(),
        email: t.String(),
        emailVerified: t.Boolean(),
        image: __nullable__(t.String()),
        createdAt: t.Date(),
        updatedAt: t.Date(),
    }, { additionalProperties: false }),
}, { additionalProperties: false });
export const PasskeyPlainInputCreate = t.Object({
    name: t.Optional(__nullable__(t.String())),
    publicKey: t.String(),
    counter: t.Integer(),
    deviceType: t.String(),
    backedUp: t.Boolean(),
    transports: t.Optional(__nullable__(t.String())),
    createdAt: t.Optional(__nullable__(t.Date())),
}, { additionalProperties: false });
export const PasskeyPlainInputUpdate = t.Object({
    name: t.Optional(__nullable__(t.String())),
    publicKey: t.Optional(t.String()),
    counter: t.Optional(t.Integer()),
    deviceType: t.Optional(t.String()),
    backedUp: t.Optional(t.Boolean()),
    transports: t.Optional(__nullable__(t.String())),
    createdAt: t.Optional(__nullable__(t.Date())),
}, { additionalProperties: false });
export const PasskeyRelationsInputCreate = t.Object({
    user: t.Object({
        connect: t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }),
    }, { additionalProperties: false }),
}, { additionalProperties: false });
export const PasskeyRelationsInputUpdate = t.Partial(t.Object({
    user: t.Object({
        connect: t.Object({
            id: t.String({ additionalProperties: false }),
        }, { additionalProperties: false }),
    }, { additionalProperties: false }),
}, { additionalProperties: false }));
export const PasskeyWhere = t.Partial(t.Recursive((Self) => t.Object({
    AND: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
    NOT: t.Union([Self, t.Array(Self, { additionalProperties: false })]),
    OR: t.Array(Self, { additionalProperties: false }),
    id: t.String(),
    name: t.String(),
    publicKey: t.String(),
    userId: t.String(),
    credentialID: t.String(),
    counter: t.Integer(),
    deviceType: t.String(),
    backedUp: t.Boolean(),
    transports: t.String(),
    createdAt: t.Date(),
    aaguid: t.String(),
}, { additionalProperties: false }), { $id: "Passkey" }));
export const PasskeyWhereUnique = t.Recursive((Self) => t.Intersect([
    t.Partial(t.Object({ id: t.String() }, { additionalProperties: false }), { additionalProperties: false }),
    t.Union([t.Object({ id: t.String() })], {
        additionalProperties: false,
    }),
    t.Partial(t.Object({
        AND: t.Union([
            Self,
            t.Array(Self, { additionalProperties: false }),
        ]),
        NOT: t.Union([
            Self,
            t.Array(Self, { additionalProperties: false }),
        ]),
        OR: t.Array(Self, { additionalProperties: false }),
    }), { additionalProperties: false }),
    t.Partial(t.Object({
        id: t.String(),
        name: t.String(),
        publicKey: t.String(),
        userId: t.String(),
        credentialID: t.String(),
        counter: t.Integer(),
        deviceType: t.String(),
        backedUp: t.Boolean(),
        transports: t.String(),
        createdAt: t.Date(),
        aaguid: t.String(),
    }, { additionalProperties: false })),
], { additionalProperties: false }), { $id: "Passkey" });
export const PasskeySelect = t.Partial(t.Object({
    id: t.Boolean(),
    name: t.Boolean(),
    publicKey: t.Boolean(),
    userId: t.Boolean(),
    user: t.Boolean(),
    credentialID: t.Boolean(),
    counter: t.Boolean(),
    deviceType: t.Boolean(),
    backedUp: t.Boolean(),
    transports: t.Boolean(),
    createdAt: t.Boolean(),
    aaguid: t.Boolean(),
    _count: t.Boolean(),
}, { additionalProperties: false }));
export const PasskeyInclude = t.Partial(t.Object({ user: t.Boolean(), _count: t.Boolean() }, { additionalProperties: false }));
export const PasskeyOrderBy = t.Partial(t.Object({
    id: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    name: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    publicKey: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    userId: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    credentialID: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    counter: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    deviceType: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    backedUp: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    transports: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    createdAt: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
    aaguid: t.Union([t.Literal("asc"), t.Literal("desc")], {
        additionalProperties: false,
    }),
}, { additionalProperties: false }));
export const Passkey = t.Composite([PasskeyPlain, PasskeyRelations], {
    additionalProperties: false,
});
export const PasskeyInputCreate = t.Composite([PasskeyPlainInputCreate, PasskeyRelationsInputCreate], { additionalProperties: false });
export const PasskeyInputUpdate = t.Composite([PasskeyPlainInputUpdate, PasskeyRelationsInputUpdate], { additionalProperties: false });
