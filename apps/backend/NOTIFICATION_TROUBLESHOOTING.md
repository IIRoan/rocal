# Simple Notification System Troubleshooting Guide

## Overview

The new simple notification system stores exact notification times in the database and checks every minute for notifications to send. It uses Resend for email delivery. This is much more reliable than the previous Redis-based approach.

## Quick Test

### 1. Run the Test Script

```bash
cd apps/backend
node test-notifications.js
```

### 2. Check API Endpoints

- **Status**: `GET /api/notifications/status`
- **Debug**: `GET /api/notifications/debug`
- **Create Test Event**: `POST /api/notifications/create-test-event`
- **Test Email**: `POST /api/notifications/test-email`

## How It Works

### New Schema

The `EventNotification` table now includes:

- `notificationTime`: Exact timestamp when notification should be sent (rounded to the minute)
- `isSent`: Boolean flag to track if notification was sent
- `minutesBefore`: Still stored for reference

### Process Flow

1. When an event is created with notifications, exact notification times are calculated and stored
2. Every minute, the service queries for notifications where `notificationTime` matches the current minute
3. Notifications are sent immediately and marked as `isSent: true`
4. No complex time calculations during runtime - much more reliable!

## Common Issues & Solutions

### Issue 1: Notifications not being created

**Symptoms**: Events are created but no notifications appear in database

**Solutions**:

1. Check if notifications are being created properly:

   ```sql
   SELECT * FROM event_notification WHERE eventId = 'YOUR_EVENT_ID';
   ```

2. Verify notification times are calculated correctly:
   ```sql
   SELECT
     eventId,
     notificationType,
     minutesBefore,
     notificationTime,
     isEnabled,
     isSent
   FROM event_notification
   WHERE notificationTime > NOW()
   ORDER BY notificationTime;
   ```

### Issue 2: Emails not being sent

**Symptoms**: Notifications exist in database but emails don't arrive

**Causes**:

- Invalid Resend API key
- User has email notifications disabled
- Notification service not running

**Solutions**:

1. Check if notification service is running:

   ```bash
   # Look for this in server logs:
   # ✅ Simple Notification Service started (checking every minute)
   ```

2. Test Resend API key:

   ```bash
   curl -X POST 'https://api.resend.com/emails' \
     -H 'Authorization: Bearer YOUR_API_KEY' \
     -H 'Content-Type: application/json' \
     -d '{"from": "notifications@mailing.roan.dev", "to": "test@example.com", "subject": "Test", "text": "Test"}'
   ```

3. Check user settings:
   ```sql
   SELECT emailNotifications FROM user_settings WHERE userId = 'USER_ID';
   ```

### Issue 3: Notifications not triggering at the right time

**Symptoms**: Notifications exist but don't fire when expected

**Solutions**:

1. Check system time:

   ```bash
   date
   ```

2. Verify notification times in database:

   ```sql
   SELECT
     title,
     start as event_start,
     notificationTime,
     minutesBefore,
     NOW() as current_time,
     CASE
       WHEN notificationTime <= NOW() THEN 'Should have been sent'
       ELSE 'Future notification'
     END as status
   FROM event_notification en
   JOIN calendar_event ce ON en.eventId = ce.id
   WHERE en.isEnabled = true AND en.isSent = false
   ORDER BY notificationTime;
   ```

3. Check if notifications are being marked as sent:
   ```sql
   SELECT * FROM notification_log ORDER BY createdAt DESC LIMIT 10;
   ```

## Environment Variables Required

```bash
# Required for notifications
RESEND_API_KEY="re_your_api_key_here"

# Database
DATABASE_URL="postgresql://..."

# Other required vars
BETTER_AUTH_SECRET="your_secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## Testing Workflow

### 1. Create Test Event

```bash
curl -X POST 'http://localhost:8000/api/notifications/create-test-event' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"minutesFromNow": 3}'
```

### 2. Monitor Logs

Watch server logs for:

```
🔍 Checking for notifications at 2024-01-01T12:00:00.000Z
📋 Found 1 notifications to send
📧 Sending email notification for event "Test Event" to user@example.com
✅ Successfully sent email notification for event "Test Event"
```

### 3. Check Debug Endpoint

```bash
curl -X GET 'http://localhost:8000/api/notifications/debug' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

### 4. Verify Database State

```sql
-- Check pending notifications
SELECT
  en.notificationTime,
  en.minutesBefore,
  en.isSent,
  ce.title,
  ce.start
FROM event_notification en
JOIN calendar_event ce ON en.eventId = ce.id
WHERE en.isEnabled = true
ORDER BY en.notificationTime;

-- Check recent logs
SELECT * FROM notification_log ORDER BY createdAt DESC LIMIT 5;
```

## Manual Testing Commands

### Send Test Email

```bash
curl -X POST 'http://localhost:8000/api/notifications/test-email' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"eventId": "EVENT_ID"}'
```

### Check Status

```bash
curl -X GET 'http://localhost:8000/api/notifications/status' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Event Created │───▶│  Calculate      │───▶│  Store Exact    │
│                 │    │  Notification   │    │  Times in DB    │
│                 │    │  Times          │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
┌─────────────────┐    ┌─────────────────┐             │
│  Email Sent via │◀───│  Send & Mark    │◀────────────┘
│     Resend      │    │  as Sent        │
└─────────────────┘    └─────────────────┘
         │                       ▲
         ▼                       │
┌─────────────────┐    ┌─────────────────┐
│ Notification Log│    │  Check Every    │
│   (Database)    │    │    Minute       │
└─────────────────┘    └─────────────────┘
```

## Logs to Monitor

### Success Indicators

- `🚀 Starting Simple Notification Service...`
- `✅ Simple Notification Service started (checking every minute)`
- `🔍 Checking for notifications at [timestamp]`
- `📧 Sending email notification for event`
- `✅ Successfully sent email notification`

### Error Indicators

- `❌ Error in notification checker`
- `❌ Failed to send notification`
- `Failed to send email via Resend`

## Performance Notes

- Notification checker runs every 60 seconds (1 minute)
- Notifications are stored with exact times rounded to the minute
- Old sent notifications are cleaned up every 7 days
- No Redis dependency - uses only database and Resend
- Much more reliable than time-calculation based approaches

## Database Queries for Debugging

### Check what notifications should be sent now

```sql
SELECT
  en.*,
  ce.title,
  ce.start,
  u.email
FROM event_notification en
JOIN calendar_event ce ON en.eventId = ce.id
JOIN "user" u ON ce.userId = u.id
WHERE en.notificationTime <= NOW()
  AND en.notificationTime > NOW() - INTERVAL '1 minute'
  AND en.isEnabled = true
  AND en.isSent = false;
```

### Check recent notification activity

```sql
SELECT
  nl.*,
  ce.title
FROM notification_log nl
JOIN calendar_event ce ON nl.eventId = ce.id
WHERE nl.createdAt > NOW() - INTERVAL '1 hour'
ORDER BY nl.createdAt DESC;
```

### Find events with upcoming notifications

```sql
SELECT
  ce.title,
  ce.start,
  en.notificationTime,
  en.minutesBefore,
  en.isSent
FROM calendar_event ce
JOIN event_notification en ON ce.id = en.eventId
WHERE en.notificationTime > NOW()
  AND en.isEnabled = true
ORDER BY en.notificationTime;
```
