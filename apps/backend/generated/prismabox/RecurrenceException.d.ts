export declare const RecurrenceExceptionPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    parentEventId: import("@sinclair/typebox").TString;
    exceptionDate: import("@sinclair/typebox").TDate;
    modifiedEventId: any;
    type: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
}>;
export declare const RecurrenceExceptionRelations: import("@sinclair/typebox").TObject<{
    modifiedEvent: any;
}>;
export declare const RecurrenceExceptionPlainInputCreate: import("@sinclair/typebox").TObject<{
    exceptionDate: import("@sinclair/typebox").TDate;
    type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>;
export declare const RecurrenceExceptionPlainInputUpdate: import("@sinclair/typebox").TObject<{
    exceptionDate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>;
export declare const RecurrenceExceptionRelationsInputCreate: import("@sinclair/typebox").TObject<{
    modifiedEvent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
export declare const RecurrenceExceptionRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    modifiedEvent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    }>>;
}>;
export declare const RecurrenceExceptionWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    parentEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    exceptionDate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    modifiedEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const RecurrenceExceptionWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    parentEventId_exceptionDate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        parentEventId: import("@sinclair/typebox").TString;
        exceptionDate: import("@sinclair/typebox").TDate;
    }>>;
}>, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    parentEventId_exceptionDate: import("@sinclair/typebox").TObject<{
        parentEventId: import("@sinclair/typebox").TString;
        exceptionDate: import("@sinclair/typebox").TDate;
    }>;
}>]>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    parentEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    exceptionDate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    modifiedEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const RecurrenceExceptionSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    parentEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    exceptionDate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    modifiedEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    modifiedEvent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const RecurrenceExceptionInclude: import("@sinclair/typebox").TObject<{
    modifiedEvent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const RecurrenceExceptionOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    parentEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    exceptionDate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    modifiedEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const RecurrenceException: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    parentEventId: import("@sinclair/typebox").TString;
    type: import("@sinclair/typebox").TString;
    exceptionDate: import("@sinclair/typebox").TDate;
    modifiedEventId: any;
    modifiedEvent: any;
}>;
export declare const RecurrenceExceptionInputCreate: import("@sinclair/typebox").TObject<{
    type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    exceptionDate: import("@sinclair/typebox").TDate;
    modifiedEvent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
export declare const RecurrenceExceptionInputUpdate: import("@sinclair/typebox").TObject<{
    type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    exceptionDate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    modifiedEvent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    }>>;
}>;
//# sourceMappingURL=RecurrenceException.d.ts.map