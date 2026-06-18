import { Elysia } from "elysia";
import { emailAvailabilityQuerySchema } from "./account.contract";
import {
  calendarIdParamsSchema,
  createCalendarBodySchema,
  deleteCalendarQuerySchema,
  optionalShareLinkBodySchema,
  shareTokenParamsSchema,
  updateCalendarBodySchema,
} from "./calendar.contract";
import {
  categoryIdParamsSchema,
  createCategoryBodySchema,
  updateCategoryBodySchema,
} from "./category.contract";
import { deviceBodySchema, passwordBodySchema } from "./e2ee.contract";
import {
  bulkEventBodySchema,
  createEventBodySchema,
  declineIcsBodySchema,
  eventDateRangeQuerySchema,
  eventRouteParamsSchema,
  eventSearchCorpusQuerySchema,
  eventSearchQuerySchema,
  importIcsBodySchema,
  invitationByExternalIdQuerySchema,
  rsvpBodySchema,
  sealEncryptionBodySchema,
  updateEventBodySchema,
} from "./event.contract";
import {
  claimInviteBodySchema,
  createInviteBodySchema,
  inviteTokenQuerySchema,
  revokeInviteParamsSchema,
} from "./invite.contract";
import {
  bootstrapBodySchema,
  mailSyncQuerySchema,
  vaultBackupBodySchema,
} from "./mail.contract";
import {
  eventIdParamsSchema,
  updateEventNotificationsBodySchema,
} from "./notification.contract";
import {
  deleteRecurringEventQuerySchema,
  editRecurringEventBodySchema,
  previewRecurrenceBodySchema,
  recurringEventIdParamsSchema,
  validateRecurrenceBodySchema,
} from "./recurring.contract";
import { updateSettingsBodySchema } from "./settings.contract";
import {
  createSubscriptionBodySchema,
  deleteSubscriptionQuerySchema,
  importIcsSubscriptionBodySchema,
  subscriptionIdParamsSchema,
  updateSubscriptionBodySchema,
} from "./subscription.contract";

export const routeModels = new Elysia({ name: "route-models" }).model({
  "account.emailAvailabilityQuery": emailAvailabilityQuerySchema,
  "invite.tokenQuery": inviteTokenQuerySchema,
  "invite.claimBody": claimInviteBodySchema,
  "invite.createBody": createInviteBodySchema,
  "invite.revokeParams": revokeInviteParamsSchema,
  "calendar.createBody": createCalendarBodySchema,
  "calendar.updateBody": updateCalendarBodySchema,
  "calendar.deleteQuery": deleteCalendarQuerySchema,
  "calendar.idParams": calendarIdParamsSchema,
  "calendar.shareTokenParams": shareTokenParamsSchema,
  "calendar.shareLinkBody": optionalShareLinkBodySchema,
  "category.createBody": createCategoryBodySchema,
  "category.updateBody": updateCategoryBodySchema,
  "category.idParams": categoryIdParamsSchema,
  "e2ee.deviceBody": deviceBodySchema,
  "e2ee.passwordBody": passwordBodySchema,
  "events.searchQuery": eventSearchQuerySchema,
  "events.searchCorpusQuery": eventSearchCorpusQuerySchema,
  "events.dateRangeQuery": eventDateRangeQuerySchema,
  "events.createBody": createEventBodySchema,
  "events.updateBody": updateEventBodySchema,
  "events.idParams": eventRouteParamsSchema,
  "events.invitationByExternalIdQuery": invitationByExternalIdQuerySchema,
  "events.importIcsBody": importIcsBodySchema,
  "events.declineIcsBody": declineIcsBodySchema,
  "events.rsvpBody": rsvpBodySchema,
  "events.sealEncryptionBody": sealEncryptionBodySchema,
  "events.bulkBody": bulkEventBodySchema,
  "mail.bootstrapBody": bootstrapBodySchema,
  "mail.vaultBackupBody": vaultBackupBodySchema,
  "mail.syncQuery": mailSyncQuerySchema,
  "notifications.eventIdParams": eventIdParamsSchema,
  "notifications.updateBody": updateEventNotificationsBodySchema,
  "settings.updateBody": updateSettingsBodySchema,
  "recurring.validateBody": validateRecurrenceBodySchema,
  "recurring.previewBody": previewRecurrenceBodySchema,
  "recurring.editBody": editRecurringEventBodySchema,
  "recurring.deleteQuery": deleteRecurringEventQuerySchema,
  "recurring.eventIdParams": recurringEventIdParamsSchema,
  "subscriptions.createBody": createSubscriptionBodySchema,
  "subscriptions.updateBody": updateSubscriptionBodySchema,
  "subscriptions.deleteQuery": deleteSubscriptionQuerySchema,
  "subscriptions.importIcsBody": importIcsSubscriptionBodySchema,
  "subscriptions.idParams": subscriptionIdParamsSchema,
});

export * from "./account.contract";
export * from "./calendar.contract";
export * from "./calendar-sharing.contract";
export * from "./category.contract";
export * from "./e2ee.contract";
export * from "./event.contract";
export * from "./invite.contract";
export * from "./logging.contract";
export * from "./mail.contract";
export * from "./notification.contract";
export * from "./recurring.contract";
export * from "./route-model-names";
export * from "./settings.contract";
export * from "./subscription.contract";
