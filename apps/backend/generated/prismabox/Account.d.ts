export declare const AccountPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    accountId: import("@sinclair/typebox").TString;
    providerId: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    accessToken: any;
    refreshToken: any;
    idToken: any;
    accessTokenExpiresAt: any;
    refreshTokenExpiresAt: any;
    scope: any;
    password: any;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
}>;
export declare const AccountRelations: import("@sinclair/typebox").TObject<{
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
export declare const AccountPlainInputCreate: import("@sinclair/typebox").TObject<{
    accessToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    refreshToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    idToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    accessTokenExpiresAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    refreshTokenExpiresAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    scope: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    password: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const AccountPlainInputUpdate: import("@sinclair/typebox").TObject<{
    accessToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    refreshToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    idToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    accessTokenExpiresAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    refreshTokenExpiresAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    scope: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    password: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const AccountRelationsInputCreate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const AccountRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
export declare const AccountWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accountId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    providerId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accessToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    refreshToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    idToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accessTokenExpiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    refreshTokenExpiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    scope: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    password: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const AccountWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    providerId_accountId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        providerId: import("@sinclair/typebox").TString;
        accountId: import("@sinclair/typebox").TString;
    }>>;
}>, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    providerId_accountId: import("@sinclair/typebox").TObject<{
        providerId: import("@sinclair/typebox").TString;
        accountId: import("@sinclair/typebox").TString;
    }>;
}>]>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accountId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    providerId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accessToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    refreshToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    idToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accessTokenExpiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    refreshTokenExpiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    scope: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    password: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const AccountSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    accountId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    providerId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    accessToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    refreshToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    idToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    accessTokenExpiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    refreshTokenExpiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    scope: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    password: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const AccountInclude: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const AccountOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    accountId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    providerId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    accessToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    refreshToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    idToken: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    accessTokenExpiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    refreshTokenExpiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    scope: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    password: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const Account: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    accountId: import("@sinclair/typebox").TString;
    providerId: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    accessToken: any;
    refreshToken: any;
    idToken: any;
    accessTokenExpiresAt: any;
    refreshTokenExpiresAt: any;
    scope: any;
    password: any;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
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
export declare const AccountInputCreate: import("@sinclair/typebox").TObject<{
    accessToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    refreshToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    idToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    accessTokenExpiresAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    refreshTokenExpiresAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    scope: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    password: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const AccountInputUpdate: import("@sinclair/typebox").TObject<{
    accessToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    refreshToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    idToken: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    accessTokenExpiresAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    refreshTokenExpiresAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    scope: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    password: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
//# sourceMappingURL=Account.d.ts.map