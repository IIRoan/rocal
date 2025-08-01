#!/usr/bin/env node

/**
 * Migration script to update existing notifications to the new schema
 * This adds notificationTime and isSent fields to existing EventNotification records
 * Run with: node migrate-notifications.js
 */

const { PrismaClient } = require("./generated/prisma");
const prisma = new PrismaClient();

async function migrateNotifications() {
  console.log("🔄 Migrating existing notifications to new schema...\n");

  try {
    // 1. First, let's see what we're working with
    console.log("1. Checking existing notifications...");
    const existingNotifications = await prisma.eventNotification.findMany({
      include: {
        event: {
          select: {
            title: true,
            start: true,
          },
        },
      },
    });

    console.log(
      `   Found ${existingNotifications.length} existing notifications\n`
    );

    if (existingNotifications.length === 0) {
      console.log("✅ No existing notifications to migrate. You're all set!");
      return;
    }

    // 2. Update each notification with calculated notificationTime
    console.log("2. Calculating and updating notification times...");
    let updated = 0;

    for (const notification of existingNotifications) {
      try {
        // Calculate the exact notification time
        const eventStart = new Date(notification.event.start);
        const notificationTime = new Date(
          eventStart.getTime() - notification.minutesBefore * 60 * 1000
        );

        // Round down to the minute (no seconds)
        const roundedNotificationTime = new Date(
          notificationTime.getFullYear(),
          notificationTime.getMonth(),
          notificationTime.getDate(),
          notificationTime.getHours(),
          notificationTime.getMinutes(),
          0,
          0
        );

        // Update the notification
        await prisma.eventNotification.update({
          where: { id: notification.id },
          data: {
            notificationTime: roundedNotificationTime,
            isSent: false, // Assume not sent yet
          },
        });

        console.log(
          `   ✅ Updated notification for "${notification.event.title}" - ${notification.notificationType} at ${roundedNotificationTime.toISOString()}`
        );
        updated++;
      } catch (error) {
        console.error(
          `   ❌ Failed to update notification ${notification.id}:`,
          error
        );
      }
    }

    console.log(`\n3. Migration completed!`);
    console.log(`   • Total notifications: ${existingNotifications.length}`);
    console.log(`   • Successfully updated: ${updated}`);
    console.log(`   • Failed: ${existingNotifications.length - updated}`);

    // 4. Verify the migration
    console.log("\n4. Verifying migration...");
    const updatedNotifications = await prisma.eventNotification.findMany({
      where: {
        notificationTime: { not: null },
      },
      include: {
        event: {
          select: {
            title: true,
            start: true,
          },
        },
      },
      take: 5,
    });

    console.log(
      `   ✅ Found ${updatedNotifications.length} notifications with notificationTime set`
    );

    if (updatedNotifications.length > 0) {
      console.log("\n   Sample updated notifications:");
      updatedNotifications.forEach((notif, i) => {
        console.log(
          `     ${i + 1}. "${notif.event.title}" - ${notif.notificationType} at ${notif.notificationTime?.toISOString()}`
        );
      });
    }

    console.log("\n✅ Migration completed successfully!");
    console.log("\n🎯 Next steps:");
    console.log("   1. Start your backend server");
    console.log(
      "   2. The Simple Notification Service will automatically start"
    );
    console.log(
      '   3. Check server logs for "Simple Notification Service started"'
    );
    console.log("   4. Test with: node test-notifications.js");
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateNotifications().catch(console.error);
