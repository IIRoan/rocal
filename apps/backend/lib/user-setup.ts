import { prisma } from "./prisma";

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
      console.log(`Creating default calendars for user ${userId}`);
      
      await prisma.calendar.createMany({
        data: [
          {
            name: "Personal",
            color: "emerald",
            isVisible: true,
            isDefault: true,
            userId,
          },
          {
            name: "Work",
            color: "blue",
            isVisible: true,
            isDefault: false,
            userId,
          },
          {
            name: "Family",
            color: "rose",
            isVisible: true,
            isDefault: false,
            userId,
          },
        ],
      });

      console.log(`Created default calendars for user ${userId}`);
    }
  } catch (error) {
    console.error(`Failed to ensure calendars for user ${userId}:`, error);
    // Don't throw - this shouldn't break the app if calendar setup fails
  }
}