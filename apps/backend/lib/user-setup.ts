import { prisma } from "./prisma";
import { errorLogDetails } from "./log-sanitization";
import { createLogger } from "@workspace/logger";

const logger = createLogger("backend:user-setup");

/**
 * Ensures user has default calendars set up.
 * Creates a default "Personal" calendar if the user has no calendars.
 */
export async function ensureUserCalendars(userId: string) {
  try {
    // Check if user already has calendars
    const existingCalendars = await prisma.calendar.findMany({
      where: { userId },
    });

    // If user has no calendars, create default ones
    if (existingCalendars.length === 0) {
      logger.info(`Creating default calendars for user ${userId}`);

      await prisma.calendar.createMany({
        data: [
          {
            name: "Personal",
            color: "#10b981", // emerald
            kind: "owned",
            isPublic: false,
            isVisible: true,
            isDefault: true,
            forceFullEncryption: false,
            userId,
          },
          {
            name: "Work",
            color: "#3b82f6", // blue
            kind: "owned",
            isPublic: false,
            isVisible: true,
            isDefault: false,
            forceFullEncryption: false,
            userId,
          },
          {
            name: "Family",
            color: "#f43f5e", // rose
            kind: "owned",
            isPublic: false,
            isVisible: true,
            isDefault: false,
            forceFullEncryption: false,
            userId,
          },
        ],
      });

      logger.ok(`Created default calendars for user ${userId}`);
    }
  } catch (error) {
    logger.error(`Failed to ensure calendars for user ${userId}`, errorLogDetails(error));
    // Don't throw - this shouldn't break the app if calendar setup fails
  }
}
