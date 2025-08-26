export declare const SessionPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    expiresAt: import("@sinclair/typebox").TDate;
    token: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    ipAddress: any;
    userAgent: any;
    userId: import("@sinclair/typebox").TString;
}>;
export declare const SessionRelations: import("@sinclair/typebox").TObject<{
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
export declare const SessionPlainInputCreate: import("@sinclair/typebox").TObject<{
    expiresAt: import("@sinclair/typebox").TDate;
    token: import("@sinclair/typebox").TString;
    ipAddress: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    userAgent: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const SessionPlainInputUpdate: import("@sinclair/typebox").TObject<{
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    token: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    ipAddress: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    userAgent: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const SessionRelationsInputCreate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const SessionRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
export declare const SessionWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    token: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    ipAddress: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userAgent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>>;
export declare const SessionWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    token: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    token: import("@sinclair/typebox").TString;
}>]>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    token: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    ipAddress: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userAgent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>]>>;
export declare const SessionSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    token: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    ipAddress: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userAgent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const SessionInclude: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const SessionOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    token: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    ipAddress: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    userAgent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const Session: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    expiresAt: import("@sinclair/typebox").TDate;
    token: import("@sinclair/typebox").TString;
    ipAddress: any;
    userAgent: any;
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
export declare const SessionInputCreate: import("@sinclair/typebox").TObject<{
    expiresAt: import("@sinclair/typebox").TDate;
    token: import("@sinclair/typebox").TString;
    ipAddress: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    userAgent: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const SessionInputUpdate: import("@sinclair/typebox").TObject<{
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    token: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    ipAddress: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    userAgent: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
//# sourceMappingURL=Session.d.ts.map