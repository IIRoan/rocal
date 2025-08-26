export declare const CalendarEventPlain: import("@sinclair/typebox").TObject<{
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
}>;
export declare const CalendarEventRelations: import("@sinclair/typebox").TObject<{
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
    category: any;
    participants: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        eventId: import("@sinclair/typebox").TString;
        userId: import("@sinclair/typebox").TString;
        status: import("@sinclair/typebox").TString;
        role: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    recurrenceExceptions: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        parentEventId: import("@sinclair/typebox").TString;
        exceptionDate: import("@sinclair/typebox").TDate;
        modifiedEventId: any;
        type: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    notifications: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        eventId: import("@sinclair/typebox").TString;
        notificationType: import("@sinclair/typebox").TString;
        minutesBefore: import("@sinclair/typebox").TInteger;
        notificationTime: import("@sinclair/typebox").TDate;
        isEnabled: import("@sinclair/typebox").TBoolean;
        isSent: import("@sinclair/typebox").TBoolean;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
}>;
export declare const CalendarEventPlainInputCreate: import("@sinclair/typebox").TObject<{
    title: import("@sinclair/typebox").TString;
    description: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    start: import("@sinclair/typebox").TDate;
    end: import("@sinclair/typebox").TDate;
    allDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    location: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    color: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isPrivate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminder: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    recurrence: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    isSynced: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncedAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const CalendarEventPlainInputUpdate: import("@sinclair/typebox").TObject<{
    title: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    description: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    start: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    end: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    allDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    location: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    color: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isPrivate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminder: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    recurrence: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    isSynced: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncedAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const CalendarEventRelationsInputCreate: import("@sinclair/typebox").TObject<{
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
    category: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
    participants: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    recurrenceExceptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    notifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
}>;
export declare const CalendarEventRelationsInputUpdate: import("@sinclair/typebox").TObject<{
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
    category: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    }>>;
    participants: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    recurrenceExceptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    notifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
}>;
export declare const CalendarEventWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    title: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    description: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    start: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    end: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    allDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    location: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isPrivate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    recurrence: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    parentEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isSynced: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    externalId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    subscriptionId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    syncedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    categoryId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const CalendarEventWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    title: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    description: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    start: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    end: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    allDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    location: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isPrivate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    recurrence: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    parentEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isSynced: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    externalId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    subscriptionId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    syncedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    categoryId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const CalendarEventSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    title: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    description: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    start: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    end: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    allDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    location: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isPrivate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    recurrence: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    parentEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isSynced: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    externalId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    subscriptionId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendar: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    categoryId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    category: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    participants: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    recurrenceExceptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    notifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarEventInclude: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendar: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    category: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    participants: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    recurrenceExceptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    notifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const CalendarEventOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    title: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    description: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    start: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    end: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    allDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    location: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    color: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    isPrivate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    reminder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    recurrence: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    parentEventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    isSynced: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    externalId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    subscriptionId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    syncedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    calendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    categoryId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const CalendarEvent: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    color: any;
    description: any;
    title: import("@sinclair/typebox").TString;
    end: import("@sinclair/typebox").TDate;
    start: import("@sinclair/typebox").TDate;
    location: any;
    allDay: import("@sinclair/typebox").TBoolean;
    timezone: import("@sinclair/typebox").TString;
    isPrivate: import("@sinclair/typebox").TBoolean;
    reminder: any;
    recurrence: any;
    parentEventId: any;
    isSynced: import("@sinclair/typebox").TBoolean;
    externalId: any;
    subscriptionId: any;
    syncedAt: any;
    calendarId: import("@sinclair/typebox").TString;
    categoryId: any;
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
    category: any;
    participants: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        eventId: import("@sinclair/typebox").TString;
        userId: import("@sinclair/typebox").TString;
        status: import("@sinclair/typebox").TString;
        role: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    recurrenceExceptions: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        parentEventId: import("@sinclair/typebox").TString;
        exceptionDate: import("@sinclair/typebox").TDate;
        modifiedEventId: any;
        type: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    notifications: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        eventId: import("@sinclair/typebox").TString;
        notificationType: import("@sinclair/typebox").TString;
        minutesBefore: import("@sinclair/typebox").TInteger;
        notificationTime: import("@sinclair/typebox").TDate;
        isEnabled: import("@sinclair/typebox").TBoolean;
        isSent: import("@sinclair/typebox").TBoolean;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
}>;
export declare const CalendarEventInputCreate: import("@sinclair/typebox").TObject<{
    color: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    description: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    title: import("@sinclair/typebox").TString;
    end: import("@sinclair/typebox").TDate;
    start: import("@sinclair/typebox").TDate;
    location: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    allDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isPrivate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminder: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    recurrence: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    isSynced: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncedAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
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
    category: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
    participants: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    recurrenceExceptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    notifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
}>;
export declare const CalendarEventInputUpdate: import("@sinclair/typebox").TObject<{
    color: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    description: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    title: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    end: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    start: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    location: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    allDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    isPrivate: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminder: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    recurrence: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    isSynced: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    syncedAt: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
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
    category: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    }>>;
    participants: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    recurrenceExceptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    notifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
}>;
//# sourceMappingURL=CalendarEvent.d.ts.map