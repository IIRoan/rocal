import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ValidationError } from "../lib/errors";
import { RecurrenceEngine, type RecurrenceRule } from "../lib/recurrence";

export const recurringRoutes = new Elysia({ prefix: "/recurring" })
  // Validate recurrence rule
  .post(
    "/validate",
    async ({ body }: any) => {
      const { rule } = body;
      
      try {
        const parsedRule = typeof rule === 'string' 
          ? RecurrenceEngine.parseRecurrenceRule(rule)
          : rule as RecurrenceRule;

        if (!parsedRule) {
          return {
            valid: false,
            errors: ["Invalid recurrence rule format"],
            description: null,
          };
        }

        const errors = RecurrenceEngine.validateRecurrenceRule(parsedRule);
        const description = errors.length === 0 
          ? RecurrenceEngine.getRecurrenceDescription(parsedRule)
          : null;

        return {
          valid: errors.length === 0,
          errors,
          description,
          rule: parsedRule,
        };
      } catch (error) {
        return {
          valid: false,
          errors: ["Failed to parse recurrence rule"],
          description: null,
        };
      }
    },
    {
      auth: true,
      body: t.Object({
        rule: t.Union([
          t.String({ description: "JSON string of recurrence rule" }),
          t.Object({
            frequency: t.Union([
              t.Literal("daily"),
              t.Literal("weekly"),
              t.Literal("monthly"),
              t.Literal("yearly")
            ]),
            interval: t.Number({ minimum: 1, maximum: 999 }),
            count: t.Optional(t.Number({ minimum: 1 })),
            until: t.Optional(t.String({ description: "ISO date string" })),
            byWeekDay: t.Optional(t.Array(t.Number({ minimum: 0, maximum: 6 }))),
            byMonthDay: t.Optional(t.Array(t.Number({ minimum: 1, maximum: 31 }))),
            byMonth: t.Optional(t.Array(t.Number({ minimum: 1, maximum: 12 }))),
          })
        ]),
      }),
      detail: {
        tags: ["Recurring"],
        summary: "Validate a recurrence rule",
        description: "Validates a recurrence rule and returns a human-readable description",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Validation result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    valid: { type: "boolean" },
                    errors: { type: "array", items: { type: "string" } },
                    description: { type: "string", nullable: true },
                    rule: { type: "object", nullable: true },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
        },
      },
    }
  )

  // Generate recurrence instances for preview
  .post(
    "/preview",
    async ({ body }: any) => {
      const { eventStart, eventEnd, recurrenceRule, previewDays = 90 } = body;

      try {
        const startDate = new Date(eventStart);
        const endDate = new Date(eventEnd);
        const previewEndDate = new Date(startDate.getTime() + previewDays * 24 * 60 * 60 * 1000);

        const rule = typeof recurrenceRule === 'string'
          ? RecurrenceEngine.parseRecurrenceRule(recurrenceRule)
          : recurrenceRule as RecurrenceRule;

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
          []
        );

        return {
          instances: instances.map(instance => ({
            date: instance.date.toISOString(),
            isOriginal: instance.isOriginal,
          })),
          description: RecurrenceEngine.getRecurrenceDescription(rule),
          totalInstances: instances.length,
        };
      } catch (error) {
        throw new ValidationError("Failed to generate preview", "recurrenceRule");
      }
    },
    {
      auth: true,
      body: t.Object({
        eventStart: t.String({ description: "ISO date string" }),
        eventEnd: t.String({ description: "ISO date string" }),
        recurrenceRule: t.Union([
          t.String({ description: "JSON string of recurrence rule" }),
          t.Object({
            frequency: t.Union([
              t.Literal("daily"),
              t.Literal("weekly"), 
              t.Literal("monthly"),
              t.Literal("yearly")
            ]),
            interval: t.Number({ minimum: 1, maximum: 999 }),
            count: t.Optional(t.Number({ minimum: 1 })),
            until: t.Optional(t.String()),
            byWeekDay: t.Optional(t.Array(t.Number({ minimum: 0, maximum: 6 }))),
            byMonthDay: t.Optional(t.Array(t.Number({ minimum: 1, maximum: 31 }))),
            byMonth: t.Optional(t.Array(t.Number({ minimum: 1, maximum: 12 }))),
          })
        ]),
        previewDays: t.Optional(t.Number({ minimum: 7, maximum: 365, default: 90 })),
      }),
      detail: {
        tags: ["Recurring"],
        summary: "Preview recurring event instances",
        description: "Generate a preview of recurring event instances for the specified period",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Preview instances generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    instances: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          date: { type: "string" },
                          isOriginal: { type: "boolean" },
                        },
                      },
                    },
                    description: { type: "string" },
                    totalInstances: { type: "number" },
                  },
                },
              },
            },
          },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
        },
      },
    }
  )

  // Edit recurring event series
  .put(
    "/event/:id",
    async ({ params, body, user }: any) => {
      const { id } = params;
      const { editScope, updates } = body;

      // Verify event exists and belongs to user
      const existingEvent = await prisma.calendarEvent.findFirst({
        where: {
          id,
          userId: user.id,
          recurrence: { not: null },
        },
      });

      if (!existingEvent) {
        throw new ValidationError("Recurring event not found or access denied");
      }

      switch (editScope) {
        case "this_only": {
          // Create exception for this specific occurrence
          const { occurrenceDate, ...eventUpdates } = updates;
          
          if (!occurrenceDate) {
            throw new ValidationError("Occurrence date is required for 'this_only' edit", "occurrenceDate");
          }

          const exceptionDate = new Date(occurrenceDate);

          // Create modified event
          const modifiedEvent = await prisma.calendarEvent.create({
            data: {
              ...eventUpdates,
              parentEventId: id,
              recurrence: null, // Exception events don't have recurrence
              userId: user.id,
              start: eventUpdates.start ? new Date(eventUpdates.start) : existingEvent.start,
              end: eventUpdates.end ? new Date(eventUpdates.end) : existingEvent.end,
            },
            include: {
              category: true,
              calendar: true,
            },
          });

          // Create exception record
          await prisma.recurrenceException.create({
            data: {
              parentEventId: id,
              exceptionDate,
              modifiedEventId: modifiedEvent.id,
              type: "modified",
            },
          });

          return modifiedEvent;
        }

        case "this_and_future": {
          const { occurrenceDate, ...eventUpdates } = updates;
          
          if (!occurrenceDate) {
            throw new ValidationError("Occurrence date is required for 'this_and_future' edit", "occurrenceDate");
          }

          const splitDate = new Date(occurrenceDate);

          // Update original event to end before split date
          const originalRule = RecurrenceEngine.parseRecurrenceRule(existingEvent.recurrence!);
          if (originalRule) {
            originalRule.until = new Date(splitDate.getTime() - 24 * 60 * 60 * 1000);
            await prisma.calendarEvent.update({
              where: { id },
              data: {
                recurrence: RecurrenceEngine.createRecurrenceRule(originalRule),
              },
            });
          }

          // Create new recurring event starting from split date
          const newEvent = await prisma.calendarEvent.create({
            data: {
              ...existingEvent,
              ...eventUpdates,
              id: undefined,
              parentEventId: id,
              start: eventUpdates.start ? new Date(eventUpdates.start) : splitDate,
              end: eventUpdates.end ? new Date(eventUpdates.end) : new Date(splitDate.getTime() + (existingEvent.end.getTime() - existingEvent.start.getTime())),
              createdAt: undefined,
              updatedAt: undefined,
            },
            include: {
              category: true,
              calendar: true,
            },
          });

          return newEvent;
        }

        case "all": {
          // Update the entire series
          const updatedEvent = await prisma.calendarEvent.update({
            where: { id },
            data: {
              ...updates,
              start: updates.start ? new Date(updates.start) : undefined,
              end: updates.end ? new Date(updates.end) : undefined,
              updatedAt: new Date(),
            },
            include: {
              category: true,
              calendar: true,
            },
          });

          return updatedEvent;
        }

        default:
          throw new ValidationError("Invalid edit scope. Use 'this_only', 'this_and_future', or 'all'", "editScope");
      }
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ description: "Recurring event ID" }),
      }),
      body: t.Object({
        editScope: t.Union([
          t.Literal("this_only"),
          t.Literal("this_and_future"),
          t.Literal("all")
        ]),
        occurrenceDate: t.Optional(t.String({ description: "ISO date of the specific occurrence (required for this_only and this_and_future)" })),
        updates: t.Object({
          title: t.Optional(t.String()),
          description: t.Optional(t.String()),
          start: t.Optional(t.String()),
          end: t.Optional(t.String()),
          allDay: t.Optional(t.Boolean()),
          location: t.Optional(t.String()),
          color: t.Optional(t.String()),
          reminder: t.Optional(t.Number()),
          recurrence: t.Optional(t.String()),
          calendarId: t.Optional(t.String()),
          categoryId: t.Optional(t.String()),
        }),
      }),
      detail: {
        tags: ["Recurring"],
        summary: "Edit recurring event series",
        description: "Edit a recurring event with options for scope: single occurrence, this and future, or entire series",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Recurring event updated successfully" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          404: { description: "Recurring event not found" },
        },
      },
    }
  )

  // Delete recurring event series
  .delete(
    "/event/:id",
    async ({ params, query, user }: any) => {
      const { id } = params;
      const { deleteScope, occurrenceDate } = query;

      // Verify event exists and belongs to user
      const existingEvent = await prisma.calendarEvent.findFirst({
        where: {
          id,
          userId: user.id,
          recurrence: { not: null },
        },
      });

      if (!existingEvent) {
        throw new ValidationError("Recurring event not found or access denied");
      }

      switch (deleteScope) {
        case "this_only": {
          if (!occurrenceDate) {
            throw new ValidationError("Occurrence date is required for 'this_only' delete", "occurrenceDate");
          }

          const exceptionDate = new Date(occurrenceDate);

          // Create deletion exception
          await prisma.recurrenceException.create({
            data: {
              parentEventId: id,
              exceptionDate,
              type: "deleted",
            },
          });

          return {
            success: true,
            message: "Single occurrence deleted successfully",
            deletedEventId: id,
            action: "delete_occurrence",
          };
        }

        case "this_and_future": {
          if (!occurrenceDate) {
            throw new ValidationError("Occurrence date is required for 'this_and_future' delete", "occurrenceDate");
          }

          const splitDate = new Date(occurrenceDate);

          // Update original event to end before split date
          const originalRule = RecurrenceEngine.parseRecurrenceRule(existingEvent.recurrence!);
          if (originalRule) {
            originalRule.until = new Date(splitDate.getTime() - 24 * 60 * 60 * 1000);
            await prisma.calendarEvent.update({
              where: { id },
              data: {
                recurrence: RecurrenceEngine.createRecurrenceRule(originalRule),
              },
            });
          }

          return {
            success: true,
            message: "Future occurrences deleted successfully",
            deletedEventId: id,
            action: "delete_future",
          };
        }

        case "all": {
          // Delete the entire series and all exceptions
          await prisma.recurrenceException.deleteMany({
            where: { parentEventId: id },
          });

          await prisma.calendarEvent.deleteMany({
            where: { parentEventId: id },
          });

          await prisma.calendarEvent.delete({
            where: { id },
          });

          return {
            success: true,
            message: "Entire recurring series deleted successfully",
            deletedEventId: id,
            action: "delete_all",
          };
        }

        default:
          throw new ValidationError("Invalid delete scope. Use 'this_only', 'this_and_future', or 'all'", "deleteScope");
      }
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({ description: "Recurring event ID" }),
      }),
      query: t.Object({
        deleteScope: t.Union([
          t.Literal("this_only"),
          t.Literal("this_and_future"),
          t.Literal("all")
        ]),
        occurrenceDate: t.Optional(t.String({ description: "ISO date of the specific occurrence" })),
      }),
      detail: {
        tags: ["Recurring"],
        summary: "Delete recurring event series",
        description: "Delete a recurring event with options for scope: single occurrence, this and future, or entire series",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Recurring event deleted successfully" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          404: { description: "Recurring event not found" },
        },
      },
    }
  )

  // Get common recurrence patterns
  .get(
    "/patterns",
    async () => {
      const patterns = RecurrenceEngine.createCommonPatterns();
      
      return {
        patterns: {
          daily: {
            rule: patterns.daily(),
            description: "Daily",
          },
          weekly: {
            rule: patterns.weekly(),
            description: "Weekly",
          },
          biweekly: {
            rule: patterns.biweekly(),
            description: "Every 2 weeks",
          },
          monthly: {
            rule: patterns.monthly(),
            description: "Monthly",
          },
          yearly: {
            rule: patterns.yearly(),
            description: "Yearly",
          },
          weekdays: {
            rule: patterns.weekdays(),
            description: "Every weekday (Monday to Friday)",
          },
        },
      };
    },
    {
      auth: true,
      detail: {
        tags: ["Recurring"],
        summary: "Get common recurrence patterns",
        description: "Returns pre-defined common recurrence patterns",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Common recurrence patterns",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    patterns: {
                      type: "object",
                      additionalProperties: {
                        type: "object",
                        properties: {
                          rule: { type: "object" },
                          description: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
        },
      },
    }
  );