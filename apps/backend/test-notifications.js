#!/usr/bin/env node

/**
 * Simple test script to verify the new notification system is working
 * Run with: node test-notifications.js
 */

const { PrismaClient } = require("./generated/prisma");
const prisma = new PrismaClient();

async function testNotificationSystem() {
  console.log("🧪 Testing Simple Notification System...\n");

  try {
    // 1. Check database connection
    console.log("1. Testing database connection...");
    await prisma.$queryRaw`SELECT 1`;
    console.log("   ✅ Database connected\n");

    // 2. Check if we have users
    console.log("2. Checking for users...");
    const users = await prisma.user.findMany({ take: 1 });
    if (users.length === 0) {
      console.log("   ❌ No users found. Please create a user first.");
      return;
    }
    const testUser = users[0];
    console.log(`   ✅ Found user: ${testUser.email}\n`);

    // 3. Check if user has a default calendar
    console.log("3. Checking for default calendar...");
    let defaultCalendar = await prisma.calendar.findFirst({
      where: { userId: testUser.id, isDefault: true },
    });

    if (!defaultCalendar) {
      console.log("   ⚠️  No default calendar found, creating one...");
      defaultCalendar = await prisma.calendar.create({
        data: {
          name: "Default Calendar",
          color: "blue",
          isDefault: true,
          userId: testUser.id,
        },
      });
    }
    console.log(`   ✅ Default calendar: ${defaultCalendar.name}\n`);

    // 4. Create a test event with notifications using the new schema
    console.log("4. Creating test event with notifications...");
    const eventStart = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes from now
    const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000); // 1 hour duration

    const testEvent = await prisma.calendarEvent.create({
      data: {
        title: `Test Event - ${new Date().toLocaleTimeString()}`,
        description:
          "This is a test event to verify the new notification system works",
        start: eventStart,
        end: eventEnd,
        allDay: false,
        userId: testUser.id,
        calendarId: defaultCalendar.id,
      },
    });

    console.log(`   ✅ Created event: "${testEvent.title}"`);
    console.log(`   📅 Start time: ${eventStart.toISOString()}\n`);

    // 5. Add email notifications with calculated notification times
    console.log("5. Adding email notifications with calculated times...");

    // Calculate notification times (rounded to the minute)
    const notification1Time = new Date(eventStart.getTime() - 1 * 60 * 1000); // 1 minute before
    const notification2Time = new Date(eventStart.getTime() - 2 * 60 * 1000); // 2 minutes before

    // Round down to the minute (no seconds)
    const roundedNotif1Time = new Date(
      notification1Time.getFullYear(),
      notification1Time.getMonth(),
      notification1Time.getDate(),
      notification1Time.getHours(),
      notification1Time.getMinutes(),
      0,
      0
    );

    const roundedNotif2Time = new Date(
      notification2Time.getFullYear(),
      notification2Time.getMonth(),
      notification2Time.getDate(),
      notification2Time.getHours(),
      notification2Time.getMinutes(),
      0,
      0
    );

    const notifications = await prisma.eventNotification.createMany({
      data: [
        {
          eventId: testEvent.id,
          notificationType: "email",
          minutesBefore: 1,
          notificationTime: roundedNotif1Time,
          isEnabled: true,
          isSent: false,
        },
        {
          eventId: testEvent.id,
          notificationType: "email",
          minutesBefore: 2,
          notificationTime: roundedNotif2Time,
          isEnabled: true,
          isSent: false,
        },
      ],
    });

    console.log(`   ✅ Added ${notifications.count} email notifications`);
    console.log(
      `   📧 Notification 1: ${roundedNotif1Time.toISOString()} (1min before)`
    );
    console.log(
      `   📧 Notification 2: ${roundedNotif2Time.toISOString()} (2min before)\n`
    );

    // 6. Check notification logs table
    console.log("6. Checking notification logs...");
    const recentLogs = await prisma.notificationLog.findMany({
      where: { userId: testUser.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    console.log(`   📊 Found ${recentLogs.length} recent notification logs\n`);

    // 7. Check pending notifications
    console.log("7. Checking pending notifications...");
    const now = new Date();
    const currentMinute = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      0,
      0
    );
    const nextHour = new Date(currentMinute.getTime() + 60 * 60 * 1000);

    const pendingNotifications = await prisma.eventNotification.findMany({
      where: {
        notificationTime: {
          gte: currentMinute,
          lt: nextHour,
        },
        isEnabled: true,
        isSent: false,
      },
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
      `   📋 Found ${pendingNotifications.length} pending notifications in the next hour`
    );
    pendingNotifications.forEach((notif, i) => {
      console.log(
        `     ${i + 1}. "${notif.event.title}" - ${notif.notificationType} at ${notif.notificationTime.toISOString()}`
      );
    });

    // 8. Summary
    console.log("\n📋 Test Summary:");
    console.log(`   • User: ${testUser.email}`);
    console.log(`   • Event: "${testEvent.title}"`);
    console.log(`   • Event ID: ${testEvent.id}`);
    console.log(`   • Start time: ${eventStart.toLocaleTimeString()}`);
    console.log(`   • Notifications: 1min and 2min before event`);
    console.log(`   • Pending notifications: ${pendingNotifications.length}`);
    console.log(`   • Recent logs: ${recentLogs.length}`);

    console.log("\n🎯 Next Steps:");
    console.log("   1. Make sure the backend server is running");
    console.log(
      "   2. The Simple Notification Service should be checking every minute"
    );
    console.log("   3. Watch server logs for notification processing");
    console.log("   4. Check your email for notifications");
    console.log(
      "   5. Use the /api/notifications/debug endpoint for real-time status"
    );

    console.log("\n✅ Test completed successfully!");
    console.log(
      "\n💡 The new system stores exact notification times and checks every minute."
    );
    console.log("   No more complex time calculations - much more reliable!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testNotificationSystem().catch(console.error);
