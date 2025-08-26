export declare const NotificationLogPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    eventId: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    notificationType: import("@sinclair/typebox").TString;
    minutesBefore: import("@sinclair/typebox").TInteger;
    sentAt: import("@sinclair/typebox").TDate;
    status: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
}>;
export declare const NotificationLogRelations: import("@sinclair/typebox").TObject<{}>;
export declare const NotificationLogPlainInputCreate: import("@sinclair/typebox").TObject<{
    notificationType: import("@sinclair/typebox").TString;
    minutesBefore: import("@sinclair/typebox").TInteger;
    sentAt: import("@sinclair/typebox").TDate;
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>;
export declare const NotificationLogPlainInputUpdate: import("@sinclair/typebox").TObject<{
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    sentAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>;
export declare const NotificationLogRelationsInputCreate: import("@sinclair/typebox").TObject<{}>;
export declare const NotificationLogRelationsInputUpdate: import("@sinclair/typebox").TObject<{}>;
export declare const NotificationLogWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    eventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    sentAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const NotificationLogWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    eventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    sentAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const NotificationLogSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    eventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    sentAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const NotificationLogInclude: import("@sinclair/typebox").TObject<{
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const NotificationLogOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    eventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    sentAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const NotificationLog: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    status: import("@sinclair/typebox").TString;
    eventId: import("@sinclair/typebox").TString;
    notificationType: import("@sinclair/typebox").TString;
    minutesBefore: import("@sinclair/typebox").TInteger;
    sentAt: import("@sinclair/typebox").TDate;
}>;
export declare const NotificationLogInputCreate: import("@sinclair/typebox").TObject<{
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    notificationType: import("@sinclair/typebox").TString;
    minutesBefore: import("@sinclair/typebox").TInteger;
    sentAt: import("@sinclair/typebox").TDate;
}>;
export declare const NotificationLogInputUpdate: import("@sinclair/typebox").TObject<{
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    sentAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>;
//# sourceMappingURL=NotificationLog.d.ts.map