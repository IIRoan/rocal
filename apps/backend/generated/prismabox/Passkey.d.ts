export declare const PasskeyPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    name: any;
    publicKey: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    credentialID: import("@sinclair/typebox").TString;
    counter: import("@sinclair/typebox").TInteger;
    deviceType: import("@sinclair/typebox").TString;
    backedUp: import("@sinclair/typebox").TBoolean;
    transports: any;
    createdAt: any;
    aaguid: any;
}>;
export declare const PasskeyRelations: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        email: import("@sinclair/typebox").TString;
        emailVerified: import("@sinclair/typebox").TBoolean;
        image: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>;
}>;
export declare const PasskeyPlainInputCreate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    publicKey: import("@sinclair/typebox").TString;
    counter: import("@sinclair/typebox").TInteger;
    deviceType: import("@sinclair/typebox").TString;
    backedUp: import("@sinclair/typebox").TBoolean;
    transports: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    createdAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const PasskeyPlainInputUpdate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    publicKey: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    counter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    deviceType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    backedUp: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    transports: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    createdAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const PasskeyRelationsInputCreate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const PasskeyRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
export declare const PasskeyWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    publicKey: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    credentialID: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    counter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    deviceType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    backedUp: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    transports: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    aaguid: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>>;
export declare const PasskeyWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    publicKey: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    credentialID: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    counter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    deviceType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    backedUp: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    transports: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    aaguid: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>]>>;
export declare const PasskeySelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    publicKey: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    credentialID: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    counter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    deviceType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    backedUp: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    transports: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    aaguid: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const PasskeyInclude: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const PasskeyOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    publicKey: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    credentialID: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    counter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    deviceType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    backedUp: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    transports: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    aaguid: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const Passkey: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    createdAt: any;
    name: any;
    publicKey: import("@sinclair/typebox").TString;
    credentialID: import("@sinclair/typebox").TString;
    counter: import("@sinclair/typebox").TInteger;
    deviceType: import("@sinclair/typebox").TString;
    backedUp: import("@sinclair/typebox").TBoolean;
    transports: any;
    aaguid: any;
    user: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        email: import("@sinclair/typebox").TString;
        emailVerified: import("@sinclair/typebox").TBoolean;
        image: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>;
}>;
export declare const PasskeyInputCreate: import("@sinclair/typebox").TObject<{
    createdAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    name: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    publicKey: import("@sinclair/typebox").TString;
    counter: import("@sinclair/typebox").TInteger;
    deviceType: import("@sinclair/typebox").TString;
    backedUp: import("@sinclair/typebox").TBoolean;
    transports: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const PasskeyInputUpdate: import("@sinclair/typebox").TObject<{
    createdAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    name: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    publicKey: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    counter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    deviceType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    backedUp: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    transports: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
//# sourceMappingURL=Passkey.d.ts.map