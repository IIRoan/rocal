export declare const UserPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    name: import("@sinclair/typebox").TString;
    email: import("@sinclair/typebox").TString;
    emailVerified: import("@sinclair/typebox").TBoolean;
    image: any;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
}>;
export declare const UserRelations: import("@sinclair/typebox").TObject<{
    sessions: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        expiresAt: import("@sinclair/typebox").TDate;
        token: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
        ipAddress: any;
        userAgent: any;
        userId: import("@sinclair/typebox").TString;
    }>>;
    accounts: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        accountId: import("@sinclair/typebox").TString;
        providerId: import("@sinclair/typebox").TString;
        userId: import("@sinclair/typebox").TString;
        accessToken: any;
        refreshToken: any;
        idToken: any;
        accessTokenExpiresAt: any;
        refreshTokenExpiresAt: any;
        scope: any;
        password: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
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
    categories: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        color: import("@sinclair/typebox").TString;
        isActive: import("@sinclair/typebox").TBoolean;
        userId: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    calendars: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        color: import("@sinclair/typebox").TString;
        isVisible: import("@sinclair/typebox").TBoolean;
        isDefault: import("@sinclair/typebox").TBoolean;
        userId: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    participations: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        eventId: import("@sinclair/typebox").TString;
        userId: import("@sinclair/typebox").TString;
        status: import("@sinclair/typebox").TString;
        role: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    settings: any;
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
    passkeys: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: any;
        publicKey: import("@sinclair/typebox").TString;
        userId: import("@sinclair/typebox").TString;
        credentialID: import("@sinclair/typebox").TString;
        counter: import("@sinclair/typebox").TInteger;
        deviceType: import("@sinclair/typebox").TString;
        backedUp: import("@sinclair/typebox").TBoolean;
        transports: any;
        createdAt: any;
        aaguid: any;
    }>>;
}>;
export declare const UserPlainInputCreate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString;
    email: import("@sinclair/typebox").TString;
    emailVerified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    image: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const UserPlainInputUpdate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    email: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    emailVerified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    image: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
}>;
export declare const UserRelationsInputCreate: import("@sinclair/typebox").TObject<{
    sessions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    accounts: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    categories: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    calendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    participations: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    settings: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    passkeys: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
}>;
export declare const UserRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    sessions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    accounts: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    categories: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    calendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    participations: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    settings: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    }>>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    passkeys: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
}>;
export declare const UserWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    email: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    emailVerified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    image: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const UserWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    email: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    email: import("@sinclair/typebox").TString;
}>]>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    email: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    emailVerified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    image: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const UserSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    email: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    emailVerified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    image: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    sessions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    accounts: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    categories: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    participations: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    settings: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    passkeys: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const UserInclude: import("@sinclair/typebox").TObject<{
    sessions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    accounts: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    categories: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    calendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    participations: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    settings: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    passkeys: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const UserOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    email: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    emailVerified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    image: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const User: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    name: import("@sinclair/typebox").TString;
    image: any;
    email: import("@sinclair/typebox").TString;
    emailVerified: import("@sinclair/typebox").TBoolean;
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
    sessions: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        expiresAt: import("@sinclair/typebox").TDate;
        token: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
        ipAddress: any;
        userAgent: any;
        userId: import("@sinclair/typebox").TString;
    }>>;
    accounts: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        accountId: import("@sinclair/typebox").TString;
        providerId: import("@sinclair/typebox").TString;
        userId: import("@sinclair/typebox").TString;
        accessToken: any;
        refreshToken: any;
        idToken: any;
        accessTokenExpiresAt: any;
        refreshTokenExpiresAt: any;
        scope: any;
        password: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    categories: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        color: import("@sinclair/typebox").TString;
        isActive: import("@sinclair/typebox").TBoolean;
        userId: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    calendars: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        color: import("@sinclair/typebox").TString;
        isVisible: import("@sinclair/typebox").TBoolean;
        isDefault: import("@sinclair/typebox").TBoolean;
        userId: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    participations: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        eventId: import("@sinclair/typebox").TString;
        userId: import("@sinclair/typebox").TString;
        status: import("@sinclair/typebox").TString;
        role: import("@sinclair/typebox").TString;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>>;
    settings: any;
    passkeys: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: any;
        publicKey: import("@sinclair/typebox").TString;
        userId: import("@sinclair/typebox").TString;
        credentialID: import("@sinclair/typebox").TString;
        counter: import("@sinclair/typebox").TInteger;
        deviceType: import("@sinclair/typebox").TString;
        backedUp: import("@sinclair/typebox").TBoolean;
        transports: any;
        createdAt: any;
        aaguid: any;
    }>>;
}>;
export declare const UserInputCreate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString;
    image: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    email: import("@sinclair/typebox").TString;
    emailVerified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    subscriptions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    sessions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    accounts: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    categories: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    calendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    participations: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
    settings: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
    passkeys: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
    }>>;
}>;
export declare const UserInputUpdate: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    image: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    email: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    emailVerified: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    events: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
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
    sessions: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    accounts: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    categories: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    calendars: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    participations: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
    settings: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    }>>;
    passkeys: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
        disconnect: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>>>;
    }>>;
}>;
//# sourceMappingURL=User.d.ts.map