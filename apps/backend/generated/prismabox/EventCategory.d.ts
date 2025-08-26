export declare const EventCategoryPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    name: import("@sinclair/typebox").TString;
    color: import("@sinclair/typebox").TString;
    isActive: import("@sinclair/typebox").TBoolean;
    userId: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
}>;
export declare const EventCategoryRelations: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        email: import("@sinclair/typebox").TString;
        emailVerified: import("@sinclair/typebox").TBoolean;
        image: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>;
    events: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        title: import("@sinclair/typebox").TString;
        description: any;
        start: import("@sinclair/typebox").TDate;
        end: import("@sinclair/typebox").TDate;
        allDay: import("@sinclair/typebox").TBoolean;
        location: any;
        color: any;
        timezone: import("@sinclair/typebox").TString;
        isPrivate: import("@sinclair/typebox").TBoolean;
        reminder: any;
        recurrence: any;
        parentEventId: any;
        isSynced: import("@sinclair/typebox").TBoolean;
        externalId: any;
        subscriptionId: any;
        syncedAt: any;
        userId: import("@sinclair/typebox").TString;
        calendarId: import("@sinclair/typebox").TString;
        categoryId: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
}>;
export declare const EventCategoryPlainInputCreate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString;
    color: import("@sinclair/typebox").TString;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const EventCategoryPlainInputUpdate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const EventCategoryRelationsInputCreate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
}>;
export declare const EventCategoryRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
}>;
export declare const EventCategoryWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const EventCategoryWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId_name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        userId: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
    }>>;
}>, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    userId_name: import("@sinclair/typebox").TObject<{
        userId: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
    }>;
}>]>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const EventCategorySelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const EventCategoryInclude: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const EventCategoryOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const EventCategory: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    name: import("@sinclair/typebox").TString;
    color: import("@sinclair/typebox").TString;
    isActive: import("@sinclair/typebox").TBoolean;
    user: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        email: import("@sinclair/typebox").TString;
        emailVerified: import("@sinclair/typebox").TBoolean;
        image: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>;
    events: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        title: import("@sinclair/typebox").TString;
        description: any;
        start: import("@sinclair/typebox").TDate;
        end: import("@sinclair/typebox").TDate;
        allDay: import("@sinclair/typebox").TBoolean;
        location: any;
        color: any;
        timezone: import("@sinclair/typebox").TString;
        isPrivate: import("@sinclair/typebox").TBoolean;
        reminder: any;
        recurrence: any;
        parentEventId: any;
        isSynced: import("@sinclair/typebox").TBoolean;
        externalId: any;
        subscriptionId: any;
        syncedAt: any;
        userId: import("@sinclair/typebox").TString;
        calendarId: import("@sinclair/typebox").TString;
        categoryId: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
}>;
export declare const EventCategoryInputCreate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString;
    color: import("@sinclair/typebox").TString;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
}>;
export declare const EventCategoryInputUpdate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
}>;
//# sourceMappingURL=EventCategory.d.ts.map