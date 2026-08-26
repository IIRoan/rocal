import { createLogger } from "@workspace/logger";
import {
  resolveTimezone,
  type EventParticipant,
  type EventParticipantInput,
  type EventParticipantRole,
  type EventParticipantStatus,
  type OperationWarning,
} from "@workspace/calendar-core";
import {
  buildIcsEventFile,
  type IcsBuildEventInput,
} from "@workspace/calendar-ics";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import {
  mapEventParticipant,
  resolveParticipantInputs,
  normalizeParticipantEmail,
  normalizeParticipantStatus,
  type EventParticipantRecord,
  EVENT_PARTICIPANT_USER_SELECT,
} from "../lib/event-participants";
import { buildEventInvitationEmail } from "../lib/auth-email";
import { authEmailFrom, mailer } from "../lib/email-client";
import { sendEventInvitationEmail } from "../lib/event-invitation-delivery";
import { createStalwartAdminClient } from "../lib/stalwart-admin";
import { env } from "../lib/env";
import { emailDeliveryWarning } from "../lib/email-delivery";
import { errorLogDetails, logRef } from "../lib/log-sanitization";

const logger = createLogger("backend:event-participants");

type ParticipantClient = PrismaClient | Prisma.TransactionClient;

type ResolvedParticipant = {
  email: string;
  displayName: string;
  userId: string | null;
  role: EventParticipantRole;
  status: EventParticipantStatus;
};

type SyncEventParticipantsInput = {
  eventId: string;
  participants: EventParticipantInput[];
  ownerUserId?: string;
  tx?: ParticipantClient;
  sendInvitations?: boolean;
  invitationEvent?: IcsBuildEventInput;
  calendarName?: string;
};

type SyncEventParticipantsResult = {
  changed: boolean;
  participants: EventParticipant[];
  /**
   * Call this AFTER the surrounding database transaction has committed.
   * Dispatching emails inside an uncommitted transaction risks sending
   * invitations for events that never persisted.
   */
  sendPendingInvitations: () => Promise<OperationWarning[]>;
};

export class EventParticipantService {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: ParticipantClient) {
    return tx ?? this.prisma;
  }

  private async resolveOwner(
    client: ParticipantClient,
    ownerUserId?: string,
  ): Promise<{
    id: string;
    email: string;
    name: string;
  } | null> {
    if (!ownerUserId) {
      return null;
    }

    const owner = await client.user.findUnique({
      where: { id: ownerUserId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!owner?.email?.trim()) {
      return null;
    }

    return {
      id: owner.id,
      email: normalizeParticipantEmail(owner.email),
      name: owner.name?.trim() || owner.email.trim(),
    };
  }

  private async resolveParticipants(
    client: ParticipantClient,
    input: SyncEventParticipantsInput,
  ): Promise<ResolvedParticipant[]> {
    const owner = await this.resolveOwner(client, input.ownerUserId);
    const resolvedInputs = resolveParticipantInputs({
      owner,
      participants: input.participants,
    });
    const emails = resolvedInputs.map((participant) => participant.email);
    if (emails.length === 0) {
      return [];
    }
    const [users, directoryEntries] = await Promise.all([
      client.user.findMany({
        where: { email: { in: emails } },
        select: {
          id: true,
          email: true,
          name: true,
        },
      }),
      client.mailDirectoryEntry.findMany({
        where: { email: { in: emails } },
        select: {
          email: true,
          userId: true,
        },
      }),
    ]);
    const userByEmail = new Map(
      users.map((user) => [normalizeParticipantEmail(user.email), user]),
    );
    const directoryByEmail = new Map(
      directoryEntries.map((entry) => [
        normalizeParticipantEmail(entry.email),
        entry,
      ]),
    );
    const participantByEmail = new Map(
      resolvedInputs.map((participant) => [participant.email, participant]),
    );

    return emails.map((email) => {
      const participant = participantByEmail.get(email)!;
      const matchedUser = userByEmail.get(email);
      const matchedDirectory = directoryByEmail.get(email);
      const role = participant.role === "organizer" ? "organizer" : "attendee";

      return {
        email,
        displayName:
          participant.displayName?.trim() || matchedUser?.name?.trim() || email,
        userId: matchedUser?.id ?? matchedDirectory?.userId ?? null,
        role,
        status:
          role === "organizer"
            ? "accepted"
            : normalizeParticipantStatus(participant.status, role),
      };
    });
  }

  async syncParticipants(
    input: SyncEventParticipantsInput,
  ): Promise<SyncEventParticipantsResult> {
    const client = this.getClient(input.tx);
    const resolvedParticipants = await this.resolveParticipants(client, input);
    const nextByEmail = new Map(
      resolvedParticipants.map((participant) => [
        participant.email,
        participant,
      ]),
    );

    const existing = await client.eventParticipant.findMany({
      where: { eventId: input.eventId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Build a lookup keyed by the best available email, skipping entries
    // that have neither a participant email nor a linked user email.
    const existingByEmail = new Map(
      existing
        .map((participant) => {
          const key =
            normalizeParticipantEmail(participant.email) ||
            normalizeParticipantEmail(participant.user?.email);
          return key ? ([key, participant] as const) : null;
        })
        .filter(
          (entry): entry is [string, (typeof existing)[0]] => entry !== null,
        ),
    );

    let changed = false;
    const removedEmails = [...existingByEmail.keys()].filter(
      (email) => !nextByEmail.has(email),
    );
    if (removedEmails.length > 0) {
      await client.eventParticipant.deleteMany({
        where: {
          eventId: input.eventId,
          email: { in: removedEmails },
        },
      });
      changed = true;
    }

    await Promise.all(
      resolvedParticipants.map(async (participant) => {
        const existingParticipant = existingByEmail.get(participant.email);
        if (
          existingParticipant &&
          existingParticipant.userId === participant.userId &&
          existingParticipant.displayName === participant.displayName &&
          existingParticipant.role === participant.role &&
          existingParticipant.status === participant.status
        ) {
          return;
        }

        await client.eventParticipant.upsert({
          where: {
            eventId_email: {
              eventId: input.eventId,
              email: participant.email,
            },
          },
          create: {
            eventId: input.eventId,
            userId: participant.userId,
            email: participant.email,
            displayName: participant.displayName,
            role: participant.role,
            status: participant.status,
          },
          update: {
            userId: participant.userId,
            displayName: participant.displayName,
            role: participant.role,
            status: participant.status,
          },
        });
        changed = true;
      }),
    );

    const [finalParticipants, sendPendingInvitations] = await Promise.all([
      client.eventParticipant.findMany({
        where: { eventId: input.eventId },
        include: {
          user: {
            select: EVENT_PARTICIPANT_USER_SELECT,
          },
        },
      }),
      // Build the invitation-sending closure now (while we have the resolved data)
      // but return it to the caller so emails are sent AFTER the DB transaction commits.
      this.buildInvitationSender(input, resolvedParticipants, existingByEmail),
    ]);

    return {
      changed,
      participants: finalParticipants.map((participant) =>
        mapEventParticipant(participant as EventParticipantRecord),
      ),
      sendPendingInvitations,
    };
  }

  /**
   * Prepares a closure that sends email invitations to new attendees.
   * Separating this from the DB writes ensures invitations are only dispatched
   * after the caller's transaction has committed.
   */
  private async buildInvitationSender(
    input: SyncEventParticipantsInput,
    resolvedParticipants: ResolvedParticipant[],
    existingByEmail: Map<string, unknown>,
  ): Promise<() => Promise<OperationWarning[]>> {
    if (
      !input.sendInvitations ||
      !input.invitationEvent ||
      resolvedParticipants.length === 0
    ) {
      return async () => [];
    }

    const client = this.getClient(input.tx);
    const owner = await this.resolveOwner(client, input.ownerUserId);
    const newInvitees = resolvedParticipants.filter(
      (participant) =>
        participant.role !== "organizer" && !existingByEmail.has(participant.email),
    );

    if (!owner || newInvitees.length === 0) {
      return async () => [];
    }

    const icsContent = buildIcsEventFile({
      calendar: {
        name: input.calendarName || "Solace",
        timezone: resolveTimezone(input.invitationEvent.timezone),
        method: "REQUEST",
      },
      event: {
        ...input.invitationEvent,
        participants: resolvedParticipants.map((p) => ({
          email: p.email,
          displayName: p.displayName,
          role: p.role,
          status: p.status,
        })),
      },
    });

    const adminClient =
      env.stalwartAdminToken.trim().length > 0
        ? createStalwartAdminClient()
        : null;

    return async () => {
      const warnings: OperationWarning[] = [];

      for (const invitee of newInvitees) {
        try {
          const invitationMessage = {
            ...buildEventInvitationEmail({
              attendeeName: invitee.displayName,
              inviterName: owner.name,
              eventTitle: input.invitationEvent!.title,
              eventDescription: input.invitationEvent!.description,
              eventLocation: input.invitationEvent!.location,
              start: input.invitationEvent!.start,
              end: input.invitationEvent!.end,
              allDay: !!input.invitationEvent!.allDay,
              openUrl: new URL(
                `/calendar?eventId=${encodeURIComponent(input.eventId)}`,
                env.frontendUrl.replace(/\/+$/, "") + "/",
              ).toString(),
            }),
            attachments: [
              {
                filename: "invite.ics",
                content: icsContent,
                contentType: "text/calendar; method=REQUEST; charset=utf-8",
              },
            ],
          };

          const delivery = await sendEventInvitationEmail({
            to: invitee.email,
            from: authEmailFrom,
            message: invitationMessage,
            logger,
            mailerClient: mailer,
            adminClient,
            adminToken: env.stalwartAdminToken,
            resolveInternalMailbox: async (email) => {
              const entry = await client.mailDirectoryEntry.findUnique({
                where: { email },
                select: { stalwartAccountId: true },
              });
              return entry
                ? { stalwartAccountId: entry.stalwartAccountId }
                : null;
            },
            isProduction: env.isProduction,
            developmentFallbackContext: {
              eventId: input.eventId,
              inviteeEmail: invitee.email,
            },
          });

          if (!delivery.delivered) {
            warnings.push(
              emailDeliveryWarning("event invitation", invitee.email),
            );
          }
        } catch (error) {
          logger.warn("Failed to send event invitation", {
            eventId: input.eventId,
            recipientRef: logRef(invitee.email),
            ...errorLogDetails(error),
          });
          warnings.push(
            emailDeliveryWarning("event invitation", invitee.email),
          );
        }
      }

      return warnings;
    };
  }
}
