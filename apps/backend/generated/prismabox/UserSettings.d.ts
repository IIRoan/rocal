export declare const UserSettingsPlain: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    theme: import("@sinclair/typebox").TString;
    defaultView: import("@sinclair/typebox").TString;
    weekStartDay: import("@sinclair/typebox").TInteger;
    timezone: import("@sinclair/typebox").TString;
    timeFormat: import("@sinclair/typebox").TString;
    workingHoursStart: import("@sinclair/typebox").TInteger;
    workingHoursEnd: import("@sinclair/typebox").TInteger;
    workingDays: import("@sinclair/typebox").TString;
    emailNotifications: import("@sinclair/typebox").TBoolean;
    browserNotifications: import("@sinclair/typebox").TBoolean;
    reminderSound: import("@sinclair/typebox").TBoolean;
    defaultReminder: any;
    defaultEventDuration: import("@sinclair/typebox").TInteger;
    defaultCalendarId: any;
    compactView: import("@sinclair/typebox").TBoolean;
    showWeekNumbers: import("@sinclair/typebox").TBoolean;
    showDeclinedEvents: import("@sinclair/typebox").TBoolean;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
}>;
export declare const UserSettingsRelations: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        email: import("@sinclair/typebox").TString;
        emailVerified: import("@sinclair/typebox").TBoolean;
        image: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>;
}>;
export declare const UserSettingsPlainInputCreate: import("@sinclair/typebox").TObject<{
    theme: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    defaultView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    weekStartDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    timeFormat: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    workingHoursStart: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingHoursEnd: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingDays: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    emailNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    browserNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminderSound: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    defaultReminder: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    defaultEventDuration: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    compactView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showWeekNumbers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showDeclinedEvents: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const UserSettingsPlainInputUpdate: import("@sinclair/typebox").TObject<{
    theme: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    defaultView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    weekStartDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    timeFormat: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    workingHoursStart: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingHoursEnd: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingDays: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    emailNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    browserNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminderSound: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    defaultReminder: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    defaultEventDuration: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    compactView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showWeekNumbers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showDeclinedEvents: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const UserSettingsRelationsInputCreate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const UserSettingsRelationsInputUpdate: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
export declare const UserSettingsWhere: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    theme: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    defaultView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    weekStartDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    timeFormat: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    workingHoursStart: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingHoursEnd: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingDays: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    emailNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    browserNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminderSound: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    defaultReminder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    defaultEventDuration: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    defaultCalendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    compactView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showWeekNumbers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showDeclinedEvents: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>>;
export declare const UserSettingsWhereUnique: import("@sinclair/typebox").TRecursive<import("@sinclair/typebox").TIntersect<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
}>, import("@sinclair/typebox").TObject<{
    userId: import("@sinclair/typebox").TString;
}>]>, import("@sinclair/typebox").TObject<{
    AND: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    NOT: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TThis, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>]>>;
    OR: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TThis>>;
}>, import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    theme: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    defaultView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    weekStartDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    timeFormat: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    workingHoursStart: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingHoursEnd: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingDays: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    emailNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    browserNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminderSound: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    defaultReminder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    defaultEventDuration: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    defaultCalendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    compactView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showWeekNumbers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showDeclinedEvents: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TDate>;
}>]>>;
export declare const UserSettingsSelect: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    theme: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    defaultView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    weekStartDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    timeFormat: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    workingHoursStart: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    workingHoursEnd: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    workingDays: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    emailNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    browserNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminderSound: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    defaultReminder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    defaultEventDuration: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    defaultCalendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    compactView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showWeekNumbers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showDeclinedEvents: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const UserSettingsInclude: import("@sinclair/typebox").TObject<{
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    _count: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export declare const UserSettingsOrderBy: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    userId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    theme: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    defaultView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    weekStartDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    timeFormat: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    workingHoursStart: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    workingHoursEnd: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    workingDays: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    emailNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    browserNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    reminderSound: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    defaultReminder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    defaultEventDuration: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    defaultCalendarId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    compactView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    showWeekNumbers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    showDeclinedEvents: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    createdAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
    updatedAt: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
}>;
export declare const UserSettings: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TString;
    userId: import("@sinclair/typebox").TString;
    createdAt: import("@sinclair/typebox").TDate;
    updatedAt: import("@sinclair/typebox").TDate;
    timezone: import("@sinclair/typebox").TString;
    theme: import("@sinclair/typebox").TString;
    defaultView: import("@sinclair/typebox").TString;
    weekStartDay: import("@sinclair/typebox").TInteger;
    timeFormat: import("@sinclair/typebox").TString;
    workingHoursStart: import("@sinclair/typebox").TInteger;
    workingHoursEnd: import("@sinclair/typebox").TInteger;
    workingDays: import("@sinclair/typebox").TString;
    emailNotifications: import("@sinclair/typebox").TBoolean;
    browserNotifications: import("@sinclair/typebox").TBoolean;
    reminderSound: import("@sinclair/typebox").TBoolean;
    defaultReminder: any;
    defaultEventDuration: import("@sinclair/typebox").TInteger;
    defaultCalendarId: any;
    compactView: import("@sinclair/typebox").TBoolean;
    showWeekNumbers: import("@sinclair/typebox").TBoolean;
    showDeclinedEvents: import("@sinclair/typebox").TBoolean;
    user: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        name: import("@sinclair/typebox").TString;
        email: import("@sinclair/typebox").TString;
        emailVerified: import("@sinclair/typebox").TBoolean;
        image: any;
        createdAt: import("@sinclair/typebox").TDate;
        updatedAt: import("@sinclair/typebox").TDate;
    }>;
}>;
export declare const UserSettingsInputCreate: import("@sinclair/typebox").TObject<{
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    theme: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    defaultView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    weekStartDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    timeFormat: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    workingHoursStart: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingHoursEnd: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingDays: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    emailNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    browserNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminderSound: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    defaultReminder: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    defaultEventDuration: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    compactView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showWeekNumbers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showDeclinedEvents: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>;
}>;
export declare const UserSettingsInputUpdate: import("@sinclair/typebox").TObject<{
    timezone: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    theme: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    defaultView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    weekStartDay: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    timeFormat: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    workingHoursStart: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingHoursEnd: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    workingDays: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    emailNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    browserNotifications: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    reminderSound: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    defaultReminder: import("@sinclair/typebox").TOptionalFromMappedResult<any, true>;
    defaultEventDuration: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    compactView: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showWeekNumbers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    showDeclinedEvents: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    user: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        connect: import("@sinclair/typebox").TObject<{
            id: import("@sinclair/typebox").TString;
        }>;
    }>>;
}>;
//# sourceMappingURL=UserSettings.d.ts.map