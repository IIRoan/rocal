import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  IRecurringService,
  RecurringRuleInput,
  RecurrenceValidateResult,
  RecurrencePreviewInput,
  RecurrencePreviewResult,
  RecurringEditInput,
  RecurringDeleteInput,
  RecurringDeleteResult,
  RecurrencePattern,
} from "../contracts/recurring.contract";
import { ValidationError } from "../lib/errors";
import { RecurrenceEngine, type RecurrenceRule } from "../lib/recurrence";
import { createLogger } from "@workspace/logger";

const logger = createLogger("backend:recurring-service");

export class RecurringService implements IRecurringService {
  constructor(private readonly prisma: PrismaClient) {}

  validate(rule: RecurringRuleInput): RecurrenceValidateResult {
    try {
      const parsedRule =
        typeof rule === "string"
          ? RecurrenceEngine.parseRecurrenceRule(rule)
          : (rule as RecurrenceRule);

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

      return { valid: errors.length === 0, errors, description, rule: parsedRule };
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

      const rule =
        typeof recurrenceRule === "string"
          ? RecurrenceEngine.parseRecurrenceRule(recurrenceRule)
          : (recurrenceRule as RecurrenceRule);

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

    const existingEvent = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, userId, recurrence: { not: null } },
    });

    if (!existingEvent) {
      throw new ValidationError("Recurring event not found or access denied");
    }

    switch (editScope) {
      case "this_only": {
        if (!occurrenceDate) {
          throw new ValidationError(
            "Occurrence date is required for 'this_only' edit",
            "occurrenceDate",
          );
        }

        const exceptionDate = new Date(occurrenceDate);

        const modifiedEvent = await this.prisma.calendarEvent.create({
          data: {
            title: updates.title ?? existingEvent.title,
            description: updates.description ?? existingEvent.description,
            allDay: updates.allDay ?? existingEvent.allDay,
            location: updates.location ?? existingEvent.location,
            color: updates.color ?? existingEvent.color,
            reminder: updates.reminder ?? existingEvent.reminder,
            calendarId: updates.calendarId ?? existingEvent.calendarId,
            categoryId: updates.categoryId ?? existingEvent.categoryId,
            parentEventId: eventId,
            recurrence: null,
            userId,
            start: updates.start ? new Date(updates.start) : existingEvent.start,
            end: updates.end ? new Date(updates.end) : existingEvent.end,
          },
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
        if (!occurrenceDate) {
          throw new ValidationError(
            "Occurrence date is required for 'this_and_future' edit",
            "occurrenceDate",
          );
        }

        const splitDate = new Date(occurrenceDate);

        const originalRule = RecurrenceEngine.parseRecurrenceRule(
          existingEvent.recurrence!,
        );
        if (originalRule) {
          originalRule.until = new Date(splitDate.getTime() - 24 * 60 * 60 * 1000);
          await this.prisma.calendarEvent.update({
            where: { id: eventId },
            data: {
              recurrence: RecurrenceEngine.createRecurrenceRule(originalRule),
            },
          });
        }

        const newEvent = await this.prisma.calendarEvent.create({
          data: {
            title: updates.title ?? existingEvent.title,
            description: updates.description ?? existingEvent.description,
            allDay: updates.allDay ?? existingEvent.allDay,
            location: updates.location ?? existingEvent.location,
            color: updates.color ?? existingEvent.color,
            reminder: updates.reminder ?? existingEvent.reminder,
            recurrence: updates.recurrence ?? existingEvent.recurrence,
            calendarId: updates.calendarId ?? existingEvent.calendarId,
            categoryId: updates.categoryId ?? existingEvent.categoryId,
            userId,
            parentEventId: eventId,
            start: updates.start ? new Date(updates.start) : splitDate,
            end: updates.end
              ? new Date(updates.end)
              : new Date(
                  splitDate.getTime() +
                    (existingEvent.end.getTime() - existingEvent.start.getTime()),
                ),
          },
          include: { category: true, calendar: true },
        });

        return newEvent;
      }

      case "all": {
        const updatedEvent = await this.prisma.calendarEvent.update({
          where: { id: eventId },
          data: {
            ...updates,
            start: updates.start ? new Date(updates.start) : undefined,
            end: updates.end ? new Date(updates.end) : undefined,
            updatedAt: new Date(),
          },
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

  async deleteSeries(input: RecurringDeleteInput): Promise<RecurringDeleteResult> {
    const { userId, eventId, deleteScope, occurrenceDate } = input;

    logger.info("DELETE RECURRING EVENT REQUEST:", {
      eventId,
      deleteScope,
      occurrenceDate,
      userId,
    });

    const existingEvent = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, userId, recurrence: { not: null } },
    });

    if (!existingEvent) {
      throw new ValidationError("Recurring event not found or access denied");
    }

    switch (deleteScope) {
      case "this_only": {
        if (!occurrenceDate) {
          throw new ValidationError(
            "Occurrence date is required for 'this_only' delete",
            "occurrenceDate",
          );
        }

        const exceptionDate = new Date(occurrenceDate);

        const existingException = await this.prisma.recurrenceException.findUnique({
          where: {
            parentEventId_exceptionDate: { parentEventId: eventId, exceptionDate },
          },
        });

        if (existingException) {
          if (existingException.type !== "deleted") {
            await this.prisma.recurrenceException.update({
              where: {
                parentEventId_exceptionDate: { parentEventId: eventId, exceptionDate },
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
        if (!occurrenceDate) {
          throw new ValidationError(
            "Occurrence date is required for 'this_and_future' delete",
            "occurrenceDate",
          );
        }

        const splitDate = new Date(occurrenceDate);

        const originalRule = RecurrenceEngine.parseRecurrenceRule(
          existingEvent.recurrence!,
        );
        if (originalRule) {
          originalRule.until = new Date(splitDate.getTime() - 24 * 60 * 60 * 1000);
          await this.prisma.calendarEvent.update({
            where: { id: eventId },
            data: {
              recurrence: RecurrenceEngine.createRecurrenceRule(originalRule),
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
}
