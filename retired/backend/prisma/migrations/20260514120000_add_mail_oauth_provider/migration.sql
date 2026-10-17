CREATE TABLE "oauth_client" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "skip_consent" BOOLEAN,
    "enable_end_session" BOOLEAN,
    "subject_type" TEXT,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tos" TEXT,
    "policy" TEXT,
    "software_id" TEXT,
    "software_version" TEXT,
    "software_statement" TEXT,
    "redirect_uris" TEXT[] NOT NULL,
    "post_logout_redirect_uris" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "token_endpoint_auth_method" TEXT,
    "grant_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "response_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "public" BOOLEAN,
    "type" TEXT,
    "require_pkce" BOOLEAN,
    "reference_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "oauth_client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oauth_refresh_token" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "session_id" TEXT,
    "user_id" TEXT NOT NULL,
    "reference_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" TIMESTAMP(3),
    "auth_time" TIMESTAMP(3),
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "oauth_refresh_token_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oauth_access_token" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "session_id" TEXT,
    "user_id" TEXT,
    "reference_id" TEXT,
    "refresh_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "oauth_access_token_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oauth_consent" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT,
    "reference_id" TEXT,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_consent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_client_client_id_key" ON "oauth_client"("client_id");
CREATE INDEX "oauth_client_user_id_idx" ON "oauth_client"("user_id");
CREATE INDEX "oauth_client_reference_id_idx" ON "oauth_client"("reference_id");

CREATE UNIQUE INDEX "oauth_refresh_token_token_key" ON "oauth_refresh_token"("token");
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "oauth_refresh_token"("client_id");
CREATE INDEX "oauth_refresh_token_session_id_idx" ON "oauth_refresh_token"("session_id");
CREATE INDEX "oauth_refresh_token_user_id_idx" ON "oauth_refresh_token"("user_id");

CREATE UNIQUE INDEX "oauth_access_token_token_key" ON "oauth_access_token"("token");
CREATE INDEX "oauth_access_token_client_id_idx" ON "oauth_access_token"("client_id");
CREATE INDEX "oauth_access_token_session_id_idx" ON "oauth_access_token"("session_id");
CREATE INDEX "oauth_access_token_user_id_idx" ON "oauth_access_token"("user_id");
CREATE INDEX "oauth_access_token_refresh_id_idx" ON "oauth_access_token"("refresh_id");

CREATE INDEX "oauth_consent_client_id_user_id_idx" ON "oauth_consent"("client_id", "user_id");
CREATE INDEX "oauth_consent_reference_id_idx" ON "oauth_consent"("reference_id");

ALTER TABLE "oauth_client"
ADD CONSTRAINT "oauth_client_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_refresh_token"
ADD CONSTRAINT "oauth_refresh_token_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "oauth_client"("client_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_refresh_token"
ADD CONSTRAINT "oauth_refresh_token_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "session"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "oauth_refresh_token"
ADD CONSTRAINT "oauth_refresh_token_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_access_token"
ADD CONSTRAINT "oauth_access_token_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "oauth_client"("client_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_access_token"
ADD CONSTRAINT "oauth_access_token_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "session"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "oauth_access_token"
ADD CONSTRAINT "oauth_access_token_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_access_token"
ADD CONSTRAINT "oauth_access_token_refresh_id_fkey"
FOREIGN KEY ("refresh_id") REFERENCES "oauth_refresh_token"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "oauth_consent"
ADD CONSTRAINT "oauth_consent_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "oauth_client"("client_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_consent"
ADD CONSTRAINT "oauth_consent_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;