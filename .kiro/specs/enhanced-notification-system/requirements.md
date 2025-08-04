# Requirements Document

## Introduction

This document outlines the requirements for a completely reworked email notification system that provides precise, time-based event reminders. The system will calculate exact notification times when reminders are created, automatically check for notifications every minute, and handle notification updates/deletions properly.

## Requirements

### Requirement 1

**User Story:** As a user, I want to add reminders to my events with specific time intervals (e.g., 5 minutes before), so that I receive notifications at the exact calculated time.

#### Acceptance Criteria

1. WHEN a user adds a reminder to an event THEN the system SHALL calculate and store the exact notification time (event start time minus reminder interval)
2. WHEN an event starts at 13:00 and has a 5-minute reminder THEN the system SHALL store 12:55 as the notification time
3. WHEN a user creates multiple reminders for one event THEN the system SHALL create separate notification records with different calculated times
4. WHEN a reminder is created THEN the system SHALL validate that the notification time is in the future
5. IF the calculated notification time is in the past THEN the system SHALL reject the reminder creation with an appropriate error message

### Requirement 2

**User Story:** As a system administrator, I want the backend to automatically check for due notifications every minute, so that notifications are sent precisely when scheduled.

#### Acceptance Criteria

1. WHEN the system starts THEN it SHALL initialize a background process that runs every 60 seconds
2. WHEN the background process runs THEN it SHALL query for all notifications scheduled for the current minute
3. WHEN notifications are found for the current minute THEN the system SHALL send them immediately
4. WHEN a notification is successfully sent THEN the system SHALL mark it as sent to prevent duplicate sending
5. WHEN a notification fails to send THEN the system SHALL log the failure but not mark it as sent for potential retry
6. WHEN the system queries for notifications THEN it SHALL only consider enabled notifications that haven't been sent yet

### Requirement 3

**User Story:** As a user, I want to update or remove event reminders, so that the notification schedule reflects my current preferences.

#### Acceptance Criteria

1. WHEN a user updates a reminder time THEN the system SHALL recalculate and update the notification time
2. WHEN a user removes a reminder THEN the system SHALL delete the corresponding notification record
3. WHEN a user updates an event's start time THEN the system SHALL recalculate all notification times for that event
4. WHEN a user disables a reminder THEN the system SHALL mark the notification as disabled without deleting it
5. WHEN a user re-enables a disabled reminder THEN the system SHALL mark the notification as enabled if the notification time is still in the future
6. IF a re-enabled reminder's notification time is in the past THEN the system SHALL either delete it or update it based on the new event time

### Requirement 4

**User Story:** As a user, I want to receive email notifications at the exact scheduled time, so that I have reliable advance notice of my events.

#### Acceptance Criteria

1. WHEN a notification is due THEN the system SHALL send an email to the event owner's email address
2. WHEN sending an email THEN the system SHALL include event title, date, time, location, and description
3. WHEN an email is successfully sent THEN the system SHALL log the notification in the notification log
4. WHEN an email fails to send THEN the system SHALL log the failure with error details
5. WHEN a user has email notifications disabled in settings THEN the system SHALL skip sending but still mark as processed
6. WHEN sending emails THEN the system SHALL use a proper email service (Resend) with appropriate formatting

### Requirement 5

**User Story:** As a system administrator, I want comprehensive logging and monitoring of the notification system, so that I can troubleshoot issues and ensure reliability.

#### Acceptance Criteria

1. WHEN a notification is sent THEN the system SHALL create a log entry with timestamp, event ID, user ID, notification type, and status
2. WHEN a notification fails THEN the system SHALL log the error details and failure reason
3. WHEN the background process runs THEN it SHALL log the number of notifications found and processed
4. WHEN notifications are created, updated, or deleted THEN the system SHALL log these operations
5. WHEN querying notification status THEN the system SHALL provide current pending notifications and recent activity
6. WHEN old notification logs accumulate THEN the system SHALL automatically clean up logs older than 30 days

### Requirement 6

**User Story:** As a developer, I want a clean API for managing event notifications, so that the frontend can easily create, update, and delete reminders.

#### Acceptance Criteria

1. WHEN creating an event with reminders THEN the API SHALL accept an array of reminder configurations
2. WHEN updating event reminders THEN the API SHALL replace all existing reminders with the new configuration
3. WHEN deleting an event THEN the system SHALL automatically delete all associated notifications
4. WHEN querying event details THEN the API SHALL include current reminder configurations
5. WHEN the API receives invalid reminder data THEN it SHALL return appropriate validation errors
6. WHEN the API processes reminder operations THEN it SHALL ensure data consistency and handle concurrent updates properly

### Requirement 7

**User Story:** As a user, I want the system to handle edge cases gracefully, so that my notification experience is reliable even in unusual situations.

#### Acceptance Criteria

1. WHEN an event is moved to a past date THEN the system SHALL delete all future notifications for that event
2. WHEN an event is deleted THEN the system SHALL clean up all associated notifications and logs
3. WHEN the system restarts THEN it SHALL resume notification checking without missing scheduled notifications
4. WHEN there are database connection issues THEN the system SHALL retry operations and log failures appropriately
5. WHEN multiple notifications are scheduled for the same minute THEN the system SHALL process them all efficiently
6. WHEN the email service is unavailable THEN the system SHALL handle the failure gracefully and allow for retry mechanisms
