/** Registered Elysia model names — keep in sync with `routeModels` in index.ts */
export const RouteModel = {
  account: {
    emailAvailabilityQuery: "account.emailAvailabilityQuery",
  },
  invite: {
    tokenQuery: "invite.tokenQuery",
    claimBody: "invite.claimBody",
    createBody: "invite.createBody",
    revokeParams: "invite.revokeParams",
  },
  calendar: {
    createBody: "calendar.createBody",
    updateBody: "calendar.updateBody",
    deleteQuery: "calendar.deleteQuery",
    idParams: "calendar.idParams",
    shareTokenParams: "calendar.shareTokenParams",
    shareLinkBody: "calendar.shareLinkBody",
  },
  category: {
    createBody: "category.createBody",
    updateBody: "category.updateBody",
    idParams: "category.idParams",
  },
  e2ee: {
    deviceBody: "e2ee.deviceBody",
    passwordBody: "e2ee.passwordBody",
  },
  events: {
    searchQuery: "events.searchQuery",
    searchCorpusQuery: "events.searchCorpusQuery",
    dateRangeQuery: "events.dateRangeQuery",
    createBody: "events.createBody",
    updateBody: "events.updateBody",
    idParams: "events.idParams",
    invitationByExternalIdQuery: "events.invitationByExternalIdQuery",
    importIcsBody: "events.importIcsBody",
    declineIcsBody: "events.declineIcsBody",
    rsvpBody: "events.rsvpBody",
    sealEncryptionBody: "events.sealEncryptionBody",
    bulkBody: "events.bulkBody",
  },
  mail: {
    bootstrapBody: "mail.bootstrapBody",
    vaultBackupBody: "mail.vaultBackupBody",
    syncQuery: "mail.syncQuery",
  },
  notifications: {
    eventIdParams: "notifications.eventIdParams",
    updateBody: "notifications.updateBody",
  },
  push: {
    registerBody: "push.registerBody",
    unregisterBody: "push.unregisterBody",
  },
  settings: {
    updateBody: "settings.updateBody",
  },
  recentContacts: {
    putBody: "recentContacts.putBody",
  },
  profiles: {
    lookupBody: "profiles.lookupBody",
    avatarQuery: "profiles.avatarQuery",
  },
  recurring: {
    validateBody: "recurring.validateBody",
    previewBody: "recurring.previewBody",
    editBody: "recurring.editBody",
    deleteQuery: "recurring.deleteQuery",
    eventIdParams: "recurring.eventIdParams",
  },
  subscriptions: {
    createBody: "subscriptions.createBody",
    updateBody: "subscriptions.updateBody",
    deleteQuery: "subscriptions.deleteQuery",
    importIcsBody: "subscriptions.importIcsBody",
    idParams: "subscriptions.idParams",
  },
} as const;
