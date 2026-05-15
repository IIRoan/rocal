import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  IRecurringService,
  RecurringRuleInput,
  RecurrenceValidateResult,
  RecurrencePreviewInput,
  RecurrencePreviewResult,
  RecurringEditInput,
  RecurringDeleteInput,
  RecurringDeleteResult,
} from "../contracts/recurring.contract";
import { ValidationError } from "../lib/errors";
import { RecurrenceEngine, type RecurrenceRule } from "../lib/recurrence";
import {
  buildRecurringEventCreateData,
  buildRecurringEventUpdateData,
  parseRecurringRuleInput,
  requireOccurrenceDate,
  splitRecurringSeriesRule,
} from "../lib/recurring-series";
import { createLogger } from "@workspace/logger";

const logger = createLogger("backend:recurring-service");

export class RecurringService implements IRecurringService {
  constructor(private readonly prisma: PrismaClient) {}

  validate(rule: RecurringRuleInput): RecurrenceValidateResult {
    try {
      const parsedRule = parseRecurringRuleInput(rule) as RecurrenceRule | null;

      if (!parsedRule) {
        return {
          valid: false,
          errors: ["Invalid recurrence rule format"],
          description: null,
        };
      }

      const errors = RecurrenceEngine.validateRecurrenceRule(parsedRule);
      const description =
        errors.length === 0
          ? RecurrenceEngine.getRecurrenceDescription(parsedRule)
          : null;

      return {
        valid: errors.length === 0,
        errors,
        description,
        rule: parsedRule,
      };
    } catch {
      return {
        valid: false,
        errors: ["Failed to parse recurrence rule"],
        description: null,
      };
    }
  }

  preview(input: RecurrencePreviewInput): RecurrencePreviewResult {
    const { eventStart, eventEnd, recurrenceRule, previewDays = 90 } = input;

    try {
      const startDate = new Date(eventStart);
      const endDate = new Date(eventEnd);
      const previewEndDate = new Date(
        startDate.getTime() + previewDays * 24 * 60 * 60 * 1000,
      );

      const rule = parseRecurringRuleInput(recurrenceRule);

      if (!rule) {
        throw new ValidationError("Invalid recurrence rule", "recurrenceRule");
      }

      const mockEvent = {
        id: "preview",
        start: startDate,
        end: endDate,
        recurrence: RecurrenceEngine.createRecurrenceRule(rule),
      };

      const instances = RecurrenceEngine.generateInstances(
        mockEvent,
        startDate,
        previewEndDate,
        [],
      );

      return {
        instances: instances.map((instance) => ({
          date: instance.date.toISOString(),
          isOriginal: instance.isOriginal,
        })),
        description: RecurrenceEngine.getRecurrenceDescription(rule),
        totalInstances: instances.length,
      };
    } catch {
      throw new ValidationError("Failed to generate preview", "recurrenceRule");
    }
  }

  async editSeries(input: RecurringEditInput) {
    const { userId, eventId, editScope, occurrenceDate, updates } = input;

    const existingEvent = await this.getRecurringEvent(userId, eventId);

    switch (editScope) {
      case "this_only": {
        const exceptionDate = requireOccurrenceDate(
          occurrenceDate,
          "this_only",
          "edit",
        );

        const modifiedEvent = await this.prisma.calendarEvent.create({
          data: buildRecurringEventCreateData({
            existingEvent,
            updates,
            userId,
            parentEventId: eventId,
            recurrence: null,
            occurrenceDate: exceptionDate,
          }),
          include: { category: true, calendar: true },
        });

        await this.prisma.recurrenceException.create({
          data: {
            parentEventId: eventId,
            exceptionDate,
            modifiedEventId: modifiedEvent.id,
            type: "modified",
          },
        });

        return modifiedEvent;
      }

      case "this_and_future": {
        const splitDate = requireOccurrenceDate(
          occurrenceDate,
          "this_and_future",
          "edit",
        );
        const updatedRecurrence = splitRecurringSeriesRule(
          existingEvent.recurrence,
          splitDate,
        );

        if (updatedRecurrence) {
          await this.prisma.calendarEvent.update({
            where: { id: eventId },
            data: {
              recurrence: updatedRecurrence,
            },
          });
        }

        const newEvent = await this.prisma.calendarEvent.create({
          data: buildRecurringEventCreateData({
            existingEvent,
            updates,
            userId,
            parentEventId: eventId,
            recurrence: updates.recurrence ?? existingEvent.recurrence,
            occurrenceDate: splitDate,
          }),
          include: { category: true, calendar: true },
        });

        return newEvent;
      }

      case "all": {
        const updatedEvent = await this.prisma.calendarEvent.update({
          where: { id: eventId },
          data: buildRecurringEventUpdateData(updates),
          include: { category: true, calendar: true },
        });

        return updatedEvent;
      }

      default:
        throw new ValidationError(
          "Invalid edit scope. Use 'this_only', 'this_and_future', or 'all'",
          "editScope",
        );
    }
  }

  async deleteSeries(
    input: RecurringDeleteInput,
  ): Promise<RecurringDeleteResult> {
    const { userId, eventId, deleteScope, occurrenceDate } = input;

    logger.info("DELETE RECURRING EVENT REQUEST:", {
      eventId,
      deleteScope,
      occurrenceDate,
      userId,
    });

    const existingEvent = await this.getRecurringEvent(userId, eventId);

    switch (deleteScope) {
      case "this_only": {
        const exceptionDate = requireOccurrenceDate(
          occurrenceDate,
          "this_only",
          "delete",
        );

        const existingException =
          await this.prisma.recurrenceException.findUnique({
            where: {
              parentEventId_exceptionDate: {
                parentEventId: eventId,
                exceptionDate,
              },
            },
          });

        if (existingException) {
          if (existingException.type !== "deleted") {
            await this.prisma.recurrenceException.update({
              where: {
                parentEventId_exceptionDate: {
                  parentEventId: eventId,
                  exceptionDate,
                },
              },
              data: { type: "deleted" },
            });
          }
        } else {
          await this.prisma.recurrenceException.create({
            data: { parentEventId: eventId, exceptionDate, type: "deleted" },
          });
        }

        return {
          success: true,
          message: "Single occurrence deleted successfully",
          deletedEventId: eventId,
          action: "delete_occurrence",
        };
      }

      case "this_and_future": {
        const splitDate = requireOccurrenceDate(
          occurrenceDate,
          "this_and_future",
          "delete",
        );
        const updatedRecurrence = splitRecurringSeriesRule(
          existingEvent.recurrence,
          splitDate,
        );

        if (updatedRecurrence) {
          await this.prisma.calendarEvent.update({
            where: { id: eventId },
            data: {
              recurrence: updatedRecurrence,
            },
          });
        }

        return {
          success: true,
          message: "Future occurrences deleted successfully",
          deletedEventId: eventId,
          action: "delete_future",
        };
      }

      case "all": {
        await this.prisma.recurrenceException.deleteMany({
          where: { parentEventId: eventId },
        });

        await this.prisma.calendarEvent.deleteMany({
          where: { parentEventId: eventId },
        });

        await this.prisma.calendarEvent.delete({ where: { id: eventId } });

        return {
          success: true,
          message: "Entire recurring series deleted successfully",
          deletedEventId: eventId,
          action: "delete_all",
        };
      }

      default:
        throw new ValidationError(
          "Invalid delete scope. Use 'this_only', 'this_and_future', or 'all'",
          "deleteScope",
        );
    }
  }

  getCommonPatterns() {
    const patterns = RecurrenceEngine.createCommonPatterns();

    return {
      patterns: {
        daily: { rule: patterns.daily(), description: "Daily" },
        weekly: { rule: patterns.weekly(), description: "Weekly" },
        biweekly: { rule: patterns.biweekly(), description: "Every 2 weeks" },
        monthly: { rule: patterns.monthly(), description: "Monthly" },
        yearly: { rule: patterns.yearly(), description: "Yearly" },
        weekdays: { rule: patterns.weekdays(), description: "Every weekday" },
      },
    };
  }

  private async getRecurringEvent(userId: string, eventId: string) {
    const existingEvent = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, userId, recurrence: { not: null } },
    });

    if (!existingEvent) {
      throw new ValidationError("Recurring event not found or access denied");
    }

    return existingEvent;
  }
}
