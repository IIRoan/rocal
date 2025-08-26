export declare const CalendarSubscriptionPlain: import("@sinclair/typebox").TObject<{
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
}>;
export declare const CalendarSubscriptionRelations: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        email: import("@sinclair/typebox").TString;
        emailVerified: import("@sinclair/typebox").TBoolean;
        image: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>;
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
    syncLogs: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        subscriptionId: import("@sinclair/typebox").TString;
        status: import("@sinclair/typebox").TString;
        eventsAdded: import("@sinclair/typebox").TInteger;
        eventsUpdated: import("@sinclair/typebox").TInteger;
        eventsDeleted: import("@sinclair/typebox").TInteger;
        errorMessage: any;
        syncDurationMs: any;
        httpStatusCode: any;
        startedAt: import("@sinclair/typebox").TDate;
        completedAt: any;
    }>>;
}>;
export declare const CalendarSubscriptionPlainInputCreate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString;
    url: import("@sinclair/typebox").TString;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncIntervalMinutes: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    lastSyncAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    lastSyncStatus: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    lastErrorMessage: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    etag: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    lastModified: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const CalendarSubscriptionPlainInputUpdate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncIntervalMinutes: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    lastSyncAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    lastSyncStatus: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    lastErrorMessage: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    etag: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    lastModified: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const CalendarSubscriptionRelationsInputCreate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
    calendar: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
    syncLogs: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
}>;
export declare const CalendarSubscriptionRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
    calendar: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
    syncLogs: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
}>;
export declare const CalendarSubscriptionWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncIntervalMinutes: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    lastSyncAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    lastSyncStatus: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    lastErrorMessage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    etag: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    lastModified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const CalendarSubscriptionWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId_url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        userId: import("@sinclair/typebox").TString;
        url: import("@sinclair/typebox").TString;
    }>>;
}>, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    userId_url: import("@sinclair/typebox").TObject<{
        userId: import("@sinclair/typebox").TString;
        url: import("@sinclair/typebox").TString;
    }>;
}>]>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncIntervalMinutes: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    lastSyncAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    lastSyncStatus: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    lastErrorMessage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    etag: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    lastModified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const CalendarSubscriptionSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncIntervalMinutes: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    lastSyncAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    lastSyncStatus: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    lastErrorMessage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    etag: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    lastModified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendar: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncLogs: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarSubscriptionInclude: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendar: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncLogs: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarSubscriptionOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    syncIntervalMinutes: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    lastSyncAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    lastSyncStatus: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    lastErrorMessage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    etag: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    lastModified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const CalendarSubscription: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    name: import("@sinclair/typebox").TString;
    calendarId: import("@sinclair/typebox").TString;
    url: import("@sinclair/typebox").TString;
    isActive: import("@sinclair/typebox").TBoolean;
    syncIntervalMinutes: import("@sinclair/typebox").TInteger;
    lastSyncAt: any;
    lastSyncStatus: import("@sinclair/typebox").TString;
    lastErrorMessage: any;
    etag: any;
    lastModified: any;
    user: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        email: import("@sinclair/typebox").TString;
        emailVerified: import("@sinclair/typebox").TBoolean;
        image: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>;
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
    syncLogs: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        subscriptionId: import("@sinclair/typebox").TString;
        status: import("@sinclair/typebox").TString;
        eventsAdded: import("@sinclair/typebox").TInteger;
        eventsUpdated: import("@sinclair/typebox").TInteger;
        eventsDeleted: import("@sinclair/typebox").TInteger;
        errorMessage: any;
        syncDurationMs: any;
        httpStatusCode: any;
        startedAt: import("@sinclair/typebox").TDate;
        completedAt: any;
    }>>;
}>;
export declare const CalendarSubscriptionInputCreate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString;
    url: import("@sinclair/typebox").TString;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncIntervalMinutes: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    lastSyncAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    lastSyncStatus: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    lastErrorMessage: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    etag: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    lastModified: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
    calendar: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
    syncLogs: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
}>;
export declare const CalendarSubscriptionInputUpdate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isActive: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncIntervalMinutes: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    lastSyncAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    lastSyncStatus: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    lastErrorMessage: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    etag: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    lastModified: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
    calendar: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
    syncLogs: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
}>;
//# sourceMappingURL=CalendarSubscription.d.ts.map