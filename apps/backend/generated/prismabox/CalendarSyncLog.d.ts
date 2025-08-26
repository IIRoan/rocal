export declare const CalendarSyncLogPlain: import("@sinclair/typebox").TObject<{
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
}>;
export declare const CalendarSyncLogRelations: import("@sinclair/typebox").TObject<{
    subscription: import("@sinclair/typebox").TObject<{
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
}>;
export declare const CalendarSyncLogPlainInputCreate: import("@sinclair/typebox").TObject<{
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    eventsAdded: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsUpdated: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsDeleted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    errorMessage: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    syncDurationMs: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    httpStatusCode: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    startedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    completedAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const CalendarSyncLogPlainInputUpdate: import("@sinclair/typebox").TObject<{
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    eventsAdded: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsUpdated: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsDeleted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    errorMessage: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    syncDurationMs: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    httpStatusCode: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    startedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    completedAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const CalendarSyncLogRelationsInputCreate: import("@sinclair/typebox").TObject<{
    subscription: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const CalendarSyncLogRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    subscription: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
export declare const CalendarSyncLogWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    subscriptionId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    eventsAdded: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsUpdated: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsDeleted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    errorMessage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    syncDurationMs: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    httpStatusCode: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    startedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    completedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const CalendarSyncLogWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    subscriptionId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    eventsAdded: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsUpdated: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsDeleted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    errorMessage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    syncDurationMs: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    httpStatusCode: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    startedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    completedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const CalendarSyncLogSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    subscriptionId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    subscription: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    eventsAdded: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    eventsUpdated: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    eventsDeleted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    errorMessage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncDurationMs: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    httpStatusCode: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    startedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    completedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarSyncLogInclude: import("@sinclair/typebox").TObject<{
    subscription: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarSyncLogOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    subscriptionId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    eventsAdded: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    eventsUpdated: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    eventsDeleted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    errorMessage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    syncDurationMs: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    httpStatusCode: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    startedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    completedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const CalendarSyncLog: import("@sinclair/typebox").TObject<{
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
    subscription: import("@sinclair/typebox").TObject<{
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
}>;
export declare const CalendarSyncLogInputCreate: import("@sinclair/typebox").TObject<{
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    eventsAdded: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsUpdated: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsDeleted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    errorMessage: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    syncDurationMs: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    httpStatusCode: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    startedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    completedAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    subscription: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const CalendarSyncLogInputUpdate: import("@sinclair/typebox").TObject<{
    status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    eventsAdded: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsUpdated: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    eventsDeleted: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    errorMessage: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    syncDurationMs: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    httpStatusCode: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    startedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    completedAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    subscription: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
//# sourceMappingURL=CalendarSyncLog.d.ts.map