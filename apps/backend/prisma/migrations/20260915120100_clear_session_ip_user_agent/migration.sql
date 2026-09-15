-- Sessions no longer store client IP or user agent (databaseHooks in
-- lib/auth.ts null them on create). Remove values captured before that change.
UPDATE "session"
SET "ip_address" = NULL, "user_agent" = NULL
WHERE "ip_address" IS NOT NULL OR "user_agent" IS NOT NULL;
