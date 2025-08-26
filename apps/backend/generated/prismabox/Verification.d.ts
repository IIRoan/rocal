export declare const VerificationPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    identifier: import("@sinclair/typebox").TString;
    value: import("@sinclair/typebox").TString;
    expiresAt: import("@sinclair/typebox").TDate;
    createdAt: any;
    updatedAt: any;
}>;
export declare const VerificationRelations: import("@sinclair/typebox").TObject<{}>;
export declare const VerificationPlainInputCreate: import("@sinclair/typebox").TObject<{
    identifier: import("@sinclair/typebox").TString;
    value: import("@sinclair/typebox").TString;
    expiresAt: import("@sinclair/typebox").TDate;
}>;
export declare const VerificationPlainInputUpdate: import("@sinclair/typebox").TObject<{
    identifier: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    value: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>;
export declare const VerificationRelationsInputCreate: import("@sinclair/typebox").TObject<{}>;
export declare const VerificationRelationsInputUpdate: import("@sinclair/typebox").TObject<{}>;
export declare const VerificationWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    identifier: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    value: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const VerificationWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    identifier: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    value: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const VerificationSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    identifier: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    value: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const VerificationInclude: import("@sinclair/typebox").TObject<{
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const VerificationOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    identifier: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    value: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const Verification: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    createdAt: any;
    updatedAt: any;
    expiresAt: import("@sinclair/typebox").TDate;
    identifier: import("@sinclair/typebox").TString;
    value: import("@sinclair/typebox").TString;
}>;
export declare const VerificationInputCreate: import("@sinclair/typebox").TObject<{
    expiresAt: import("@sinclair/typebox").TDate;
    identifier: import("@sinclair/typebox").TString;
    value: import("@sinclair/typebox").TString;
}>;
export declare const VerificationInputUpdate: import("@sinclair/typebox").TObject<{
    expiresAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    identifier: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    value: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>;
//# sourceMappingURL=Verification.d.ts.map