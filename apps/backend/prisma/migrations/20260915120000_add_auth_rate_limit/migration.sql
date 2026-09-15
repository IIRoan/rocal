-- Better Auth rate-limit counters shared across serverless instances.
-- "key" is an HMAC of client IP + auth path; raw IPs are never stored.

-- CreateTable
CREATE TABLE "rate_limit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "rate_limit_last_request_idx" ON "rate_limit"("last_request");
