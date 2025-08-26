export declare const CalendarSharingPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    calendarId: import("@sinclair/typebox").TString;
    sharedWith: import("@sinclair/typebox").TString;
    sharedBy: import("@sinclair/typebox").TString;
    permission: import("@sinclair/typebox").TString;
    accepted: import("@sinclair/typebox").TBoolean;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
}>;
export declare const CalendarSharingRelations: import("@sinclair/typebox").TObject<{
    calendar: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        color: import("@sinclair/typebox").TString;
        isVisible: import("@sinclair/typebox").TBoolean;
        isDefault: import("@sinclair/typebox").TBoolean;
        userId: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>;
}>;
export declare const CalendarSharingPlainInputCreate: import("@sinclair/typebox").TObject<{
    sharedWith: import("@sinclair/typebox").TString;
    sharedBy: import("@sinclair/typebox").TString;
    permission: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accepted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarSharingPlainInputUpdate: import("@sinclair/typebox").TObject<{
    sharedWith: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    sharedBy: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    permission: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accepted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarSharingRelationsInputCreate: import("@sinclair/typebox").TObject<{
    calendar: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const CalendarSharingRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    calendar: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
export declare const CalendarSharingWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    sharedWith: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    sharedBy: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    permission: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accepted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const CalendarSharingWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    calendarId_sharedWith: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        calendarId: import("@sinclair/typebox").TString;
        sharedWith: import("@sinclair/typebox").TString;
    }>>;
}>, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    calendarId_sharedWith: import("@sinclair/typebox").TObject<{
        calendarId: import("@sinclair/typebox").TString;
        sharedWith: import("@sinclair/typebox").TString;
    }>;
}>]>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    sharedWith: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    sharedBy: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    permission: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accepted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const CalendarSharingSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendar: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    sharedWith: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    sharedBy: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    permission: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    accepted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarSharingInclude: import("@sinclair/typebox").TObject<{
    calendar: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarSharingOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    sharedWith: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    sharedBy: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    permission: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    accepted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const CalendarSharing: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    calendarId: import("@sinclair/typebox").TString;
    sharedWith: import("@sinclair/typebox").TString;
    sharedBy: import("@sinclair/typebox").TString;
    permission: import("@sinclair/typebox").TString;
    accepted: import("@sinclair/typebox").TBoolean;
    calendar: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        color: import("@sinclair/typebox").TString;
        isVisible: import("@sinclair/typebox").TBoolean;
        isDefault: import("@sinclair/typebox").TBoolean;
        userId: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>;
}>;
export declare const CalendarSharingInputCreate: import("@sinclair/typebox").TObject<{
    sharedWith: import("@sinclair/typebox").TString;
    sharedBy: import("@sinclair/typebox").TString;
    permission: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accepted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendar: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const CalendarSharingInputUpdate: import("@sinclair/typebox").TObject<{
    sharedWith: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    sharedBy: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    permission: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    accepted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendar: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
//# sourceMappingURL=CalendarSharing.d.ts.map