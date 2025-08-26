export declare const EventNotificationPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    eventId: import("@sinclair/typebox").TString;
    notificationType: import("@sinclair/typebox").TString;
    minutesBefore: import("@sinclair/typebox").TInteger;
    notificationTime: import("@sinclair/typebox").TDate;
    isEnabled: import("@sinclair/typebox").TBoolean;
    isSent: import("@sinclair/typebox").TBoolean;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
}>;
export declare const EventNotificationRelations: import("@sinclair/typebox").TObject<{
    event: import("@sinclair/typebox").TObject<{
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
}>;
export declare const EventNotificationPlainInputCreate: import("@sinclair/typebox").TObject<{
    notificationType: import("@sinclair/typebox").TString;
    minutesBefore: import("@sinclair/typebox").TInteger;
    notificationTime: import("@sinclair/typebox").TDate;
    isEnabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isSent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const EventNotificationPlainInputUpdate: import("@sinclair/typebox").TObject<{
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    notificationTime: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    isEnabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isSent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const EventNotificationRelationsInputCreate: import("@sinclair/typebox").TObject<{
    event: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const EventNotificationRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    event: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
export declare const EventNotificationWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    eventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    notificationTime: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    isEnabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isSent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const EventNotificationWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
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
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    notificationTime: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    isEnabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isSent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const EventNotificationSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    eventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    event: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    notificationTime: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isEnabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isSent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const EventNotificationInclude: import("@sinclair/typebox").TObject<{
    event: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const EventNotificationOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    eventId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    notificationTime: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    isEnabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    isSent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const EventNotification: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    eventId: import("@sinclair/typebox").TString;
    notificationType: import("@sinclair/typebox").TString;
    minutesBefore: import("@sinclair/typebox").TInteger;
    notificationTime: import("@sinclair/typebox").TDate;
    isEnabled: import("@sinclair/typebox").TBoolean;
    isSent: import("@sinclair/typebox").TBoolean;
    event: import("@sinclair/typebox").TObject<{
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
}>;
export declare const EventNotificationInputCreate: import("@sinclair/typebox").TObject<{
    notificationType: import("@sinclair/typebox").TString;
    minutesBefore: import("@sinclair/typebox").TInteger;
    notificationTime: import("@sinclair/typebox").TDate;
    isEnabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isSent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    event: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const EventNotificationInputUpdate: import("@sinclair/typebox").TObject<{
    notificationType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    minutesBefore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    notificationTime: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    isEnabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    isSent: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    event: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
//# sourceMappingURL=EventNotification.d.ts.map