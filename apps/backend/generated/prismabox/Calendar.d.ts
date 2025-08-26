export declare const CalendarPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    name: import("@sinclair/typebox").TString;
    color: import("@sinclair/typebox").TString;
    isVisible: import("@sinclair/typebox").TBoolean;
    isDefault: import("@sinclair/typebox").TBoolean;
    userId: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
}>;
export declare const CalendarRelations: import("@sinclair/typebox").TObject<{
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
    sharedCalendars: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        calendarId: import("@sinclair/typebox").TString;
        sharedWith: import("@sinclair/typebox").TString;
        sharedBy: import("@sinclair/typebox").TString;
        permission: import("@sinclair/typebox").TString;
        accepted: import("@sinclair/typebox").TBoolean;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    subscriptions: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        url: import("@sinclair/typebox").TString;
        isActive: import("@sinclair/typebox").TBoolean;
        syncIntervalMinutes: import("@sinclair/typebox").TInteger;
        lastSyncAt: any;
        lastSyncStatus: import("@sinclair/typebox").TString;
        lastErrorMessage: any;
        etag: any;
        lastModified: any;
        userId: import("@sinclair/typebox").TString;
        calendarId: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
}>;
export declare const CalendarPlainInputCreate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString;
    color: import("@sinclair/typebox").TString;
    isVisible: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isDefault: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarPlainInputUpdate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isVisible: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isDefault: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarRelationsInputCreate: import("@sinclair/typebox").TObject<{
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
    sharedCalendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
}>;
export declare const CalendarRelationsInputUpdate: import("@sinclair/typebox").TObject<{
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
    sharedCalendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
}>;
export declare const CalendarWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isVisible: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isDefault: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const CalendarWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
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
    isVisible: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isDefault: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const CalendarSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isVisible: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isDefault: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    sharedCalendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarInclude: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    sharedCalendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    isVisible: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    isDefault: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const Calendar: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    name: import("@sinclair/typebox").TString;
    color: import("@sinclair/typebox").TString;
    isVisible: import("@sinclair/typebox").TBoolean;
    isDefault: import("@sinclair/typebox").TBoolean;
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
    sharedCalendars: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        calendarId: import("@sinclair/typebox").TString;
        sharedWith: import("@sinclair/typebox").TString;
        sharedBy: import("@sinclair/typebox").TString;
        permission: import("@sinclair/typebox").TString;
        accepted: import("@sinclair/typebox").TBoolean;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    subscriptions: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        url: import("@sinclair/typebox").TString;
        isActive: import("@sinclair/typebox").TBoolean;
        syncIntervalMinutes: import("@sinclair/typebox").TInteger;
        lastSyncAt: any;
        lastSyncStatus: import("@sinclair/typebox").TString;
        lastErrorMessage: any;
        etag: any;
        lastModified: any;
        userId: import("@sinclair/typebox").TString;
        calendarId: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
}>;
export declare const CalendarInputCreate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString;
    color: import("@sinclair/typebox").TString;
    isVisible: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isDefault: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
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
    sharedCalendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
}>;
export declare const CalendarInputUpdate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isVisible: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isDefault: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
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
    sharedCalendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
}>;
//# sourceMappingURL=Calendar.d.ts.map