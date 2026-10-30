-- The schema of the 53 Prisma migrations through 20260928150000_add_pending_avatar_id (pg_dump --schema-only).

CREATE TABLE public.account (
    id text NOT NULL,
    scope text,
    password text,
    access_token text,
    access_token_expires_at timestamp(3) without time zone,
    account_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id_token text,
    provider_id text NOT NULL,
    refresh_token text,
    refresh_token_expires_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone NOT NULL,
    user_id text NOT NULL
);

CREATE TABLE public.calendar (
    id text NOT NULL,
    name text NOT NULL,
    color text NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    user_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    ics_share_token text,
    ics_share_enabled boolean DEFAULT false NOT NULL,
    is_sync_only boolean DEFAULT false NOT NULL,
    kind text DEFAULT 'owned'::text NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    encrypted_name text,
    blind_index_tokens text,
    encryption_state text DEFAULT 'plaintext'::text NOT NULL,
    encryption_key_version integer DEFAULT 1 NOT NULL,
    force_full_encryption boolean DEFAULT true NOT NULL,
    stalwart_account_id text,
    stalwart_calendar_id text,
    stalwart_synced_at timestamp(3) without time zone
);

CREATE TABLE public.calendar_event (
    id text NOT NULL,
    title text NOT NULL,
    description text,
    start timestamp(3) without time zone NOT NULL,
    "end" timestamp(3) without time zone NOT NULL,
    all_day boolean DEFAULT false NOT NULL,
    location text,
    color text,
    is_private boolean DEFAULT false NOT NULL,
    reminder integer,
    recurrence text,
    user_id text NOT NULL,
    category_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    calendar_id text NOT NULL,
    parent_event_id text,
    external_id text,
    is_synced boolean DEFAULT false NOT NULL,
    subscription_id text,
    synced_at timestamp(3) without time zone,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    encrypted_content text,
    blind_index_tokens text,
    encryption_state text DEFAULT 'plaintext'::text NOT NULL,
    encryption_key_version integer DEFAULT 1 NOT NULL,
    stalwart_account_id text,
    stalwart_calendar_id text,
    stalwart_event_id text,
    stalwart_uid text,
    stalwart_synced_at timestamp(3) without time zone,
    is_cancelled boolean DEFAULT false NOT NULL
);

CREATE TABLE public.calendar_sharing (
    id text NOT NULL,
    calendar_id text NOT NULL,
    shared_with text NOT NULL,
    shared_by text NOT NULL,
    permission text DEFAULT 'read'::text NOT NULL,
    accepted boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.calendar_subscription (
    id text NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sync_interval_minutes integer DEFAULT 15 NOT NULL,
    last_sync_at timestamp(3) without time zone,
    last_sync_status text DEFAULT 'pending'::text NOT NULL,
    last_error_message text,
    etag text,
    last_modified text,
    user_id text NOT NULL,
    calendar_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.calendar_sync_log (
    id text NOT NULL,
    subscription_id text NOT NULL,
    status text DEFAULT 'started'::text NOT NULL,
    events_added integer DEFAULT 0 NOT NULL,
    events_updated integer DEFAULT 0 NOT NULL,
    events_deleted integer DEFAULT 0 NOT NULL,
    error_message text,
    sync_duration_ms integer,
    http_status_code integer,
    started_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp(3) without time zone
);

CREATE TABLE public.event_category (
    id text NOT NULL,
    name text NOT NULL,
    color text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    user_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    encrypted_name text,
    blind_index_tokens text,
    encryption_state text DEFAULT 'plaintext'::text NOT NULL,
    encryption_key_version integer DEFAULT 1 NOT NULL
);

CREATE TABLE public.event_notification (
    id text NOT NULL,
    event_id text NOT NULL,
    notification_type text NOT NULL,
    minutes_before integer NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    is_sent boolean DEFAULT false NOT NULL,
    notification_time timestamp(3) without time zone NOT NULL,
    notification_date_local text NOT NULL,
    notification_timezone text DEFAULT 'UTC'::text NOT NULL,
    encrypted_display_title text,
    CONSTRAINT chk_notification_time_future CHECK ((notification_time > created_at))
);

CREATE TABLE public.event_participant (
    id text NOT NULL,
    event_id text NOT NULL,
    user_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    role text DEFAULT 'attendee'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    email text NOT NULL,
    display_name text
);

CREATE TABLE public.invite (
    id text NOT NULL,
    token text NOT NULL,
    invited_by_id text NOT NULL,
    email text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    claimed_for_email text,
    claimed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.jwks (
    id text NOT NULL,
    public_key text NOT NULL,
    private_key text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(3) without time zone,
    alg text,
    crv text
);

CREATE TABLE public.mail_directory_entry (
    id text NOT NULL,
    email text NOT NULL,
    local_part text NOT NULL,
    domain text NOT NULL,
    display_name text,
    stalwart_account_id text NOT NULL,
    stalwart_domain_id text NOT NULL,
    stalwart_public_key_id text,
    public_key_armored text NOT NULL,
    public_key_fingerprint text NOT NULL,
    key_algorithm text DEFAULT 'openpgp'::text NOT NULL,
    source text DEFAULT 'internal'::text NOT NULL,
    trust text DEFAULT 'verified'::text NOT NULL,
    key_created_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    user_id text
);

CREATE TABLE public.mail_jmap_sync_state (
    id text NOT NULL,
    directory_entry_id text NOT NULL,
    stalwart_account_id text NOT NULL,
    email_state text NOT NULL,
    mailbox_state text NOT NULL,
    thread_state text,
    last_synced_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.mail_vault_backup (
    id text NOT NULL,
    directory_entry_id text NOT NULL,
    vault_version integer NOT NULL,
    encrypted_vault_b64 text NOT NULL,
    kdf text NOT NULL,
    kdf_salt_b64 text NOT NULL,
    kdf_memory_kib integer NOT NULL,
    kdf_iterations integer NOT NULL,
    kdf_parallelism integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    wrapped_secret text,
    wrap_algorithm text
);

CREATE TABLE public.notification_job (
    id text NOT NULL,
    user_id text NOT NULL,
    kind text NOT NULL,
    channel text NOT NULL,
    event_id text,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    claimed_at timestamp(3) without time zone,
    last_error text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.notification_log (
    id text NOT NULL,
    event_id text NOT NULL,
    user_id text NOT NULL,
    notification_type text NOT NULL,
    minutes_before integer NOT NULL,
    sent_at timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.oauth_access_token (
    id text NOT NULL,
    token text NOT NULL,
    client_id text NOT NULL,
    session_id text,
    user_id text,
    reference_id text,
    refresh_id text,
    expires_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    scopes text[] DEFAULT ARRAY[]::text[] NOT NULL
);

CREATE TABLE public.oauth_client (
    id text NOT NULL,
    client_id text NOT NULL,
    client_secret text,
    disabled boolean DEFAULT false NOT NULL,
    skip_consent boolean,
    enable_end_session boolean,
    subject_type text,
    scopes text[] DEFAULT ARRAY[]::text[] NOT NULL,
    user_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    name text,
    uri text,
    icon text,
    contacts text[] DEFAULT ARRAY[]::text[] NOT NULL,
    tos text,
    policy text,
    software_id text,
    software_version text,
    software_statement text,
    redirect_uris text[] NOT NULL,
    post_logout_redirect_uris text[] DEFAULT ARRAY[]::text[] NOT NULL,
    token_endpoint_auth_method text,
    grant_types text[] DEFAULT ARRAY[]::text[] NOT NULL,
    response_types text[] DEFAULT ARRAY[]::text[] NOT NULL,
    public boolean,
    type text,
    require_pkce boolean,
    reference_id text,
    metadata jsonb
);

CREATE TABLE public.oauth_consent (
    id text NOT NULL,
    client_id text NOT NULL,
    user_id text,
    reference_id text,
    scopes text[] DEFAULT ARRAY[]::text[] NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.oauth_refresh_token (
    id text NOT NULL,
    token text NOT NULL,
    client_id text NOT NULL,
    session_id text,
    user_id text NOT NULL,
    reference_id text,
    expires_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked timestamp(3) without time zone,
    auth_time timestamp(3) without time zone,
    scopes text[] DEFAULT ARRAY[]::text[] NOT NULL
);

CREATE TABLE public.passkey (
    id text NOT NULL,
    name text,
    "publicKey" text NOT NULL,
    "userId" text NOT NULL,
    "credentialID" text NOT NULL,
    counter integer NOT NULL,
    "deviceType" text NOT NULL,
    "backedUp" boolean NOT NULL,
    transports text,
    "createdAt" timestamp(3) without time zone,
    aaguid text
);

CREATE TABLE public.push_device (
    id text NOT NULL,
    user_id text NOT NULL,
    platform text NOT NULL,
    bundle_id text NOT NULL,
    environment text NOT NULL,
    token text NOT NULL,
    token_hash text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    last_seen_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.rate_limit (
    key text NOT NULL,
    count integer NOT NULL,
    last_request bigint NOT NULL
);

CREATE TABLE public.recurrence_exception (
    id text NOT NULL,
    parent_event_id text NOT NULL,
    exception_date timestamp(3) without time zone NOT NULL,
    modified_event_id text,
    type text DEFAULT 'modified'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.session (
    id text NOT NULL,
    token text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    ip_address text,
    updated_at timestamp(3) without time zone NOT NULL,
    user_agent text,
    user_id text NOT NULL
);

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    image text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    mailbox_approved_at timestamp(3) without time zone,
    avatar_id text,
    pending_avatar_id text
);

CREATE TABLE public.user_encryption_device (
    id text NOT NULL,
    user_id text NOT NULL,
    device_id text NOT NULL,
    device_label text,
    public_key text NOT NULL,
    public_key_algorithm text DEFAULT 'RSA-OAEP-256'::text NOT NULL,
    wrapped_account_key text NOT NULL,
    wrapped_search_key text NOT NULL,
    wrap_algorithm text DEFAULT 'RSA-OAEP-256'::text NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    last_seen_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.user_encryption_password (
    id text NOT NULL,
    user_id text NOT NULL,
    kdf_algorithm text DEFAULT 'PBKDF2-SHA-256'::text NOT NULL,
    kdf_salt text NOT NULL,
    kdf_iterations integer DEFAULT 310000 NOT NULL,
    wrapped_account_key text NOT NULL,
    wrapped_search_key text NOT NULL,
    wrap_algorithm text DEFAULT 'AES-GCM-256'::text NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.user_mail_settings (
    id text NOT NULL,
    user_id text NOT NULL,
    encrypted_content text NOT NULL,
    encryption_key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.user_recent_contacts (
    id text NOT NULL,
    user_id text NOT NULL,
    encrypted_content text NOT NULL,
    encryption_key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.user_settings (
    id text NOT NULL,
    user_id text NOT NULL,
    theme text DEFAULT 'light'::text NOT NULL,
    "defaultView" text DEFAULT 'week'::text NOT NULL,
    "weekStartDay" integer DEFAULT 1 NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    "timeFormat" text DEFAULT '24h'::text NOT NULL,
    "workingHoursStart" integer DEFAULT 540 NOT NULL,
    "workingHoursEnd" integer DEFAULT 1020 NOT NULL,
    "workingDays" text DEFAULT '[1,2,3,4,5]'::text NOT NULL,
    "emailNotifications" boolean DEFAULT true NOT NULL,
    "browserNotifications" boolean DEFAULT true NOT NULL,
    "reminderSound" boolean DEFAULT true NOT NULL,
    "defaultReminder" integer,
    "defaultEventDuration" integer DEFAULT 60 NOT NULL,
    default_calendar_id text,
    "compactView" boolean DEFAULT false NOT NULL,
    "showWeekNumbers" boolean DEFAULT false NOT NULL,
    "showDeclinedEvents" boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    event_encryption_mode text DEFAULT 'full'::text NOT NULL,
    push_notifications boolean DEFAULT true NOT NULL
);

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp(3) without time zone NOT NULL,
    updated_at timestamp(3) without time zone
);

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_event
    ADD CONSTRAINT calendar_event_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar
    ADD CONSTRAINT calendar_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_sharing
    ADD CONSTRAINT calendar_sharing_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_subscription
    ADD CONSTRAINT calendar_subscription_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_sync_log
    ADD CONSTRAINT calendar_sync_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.event_category
    ADD CONSTRAINT event_category_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.event_notification
    ADD CONSTRAINT event_notification_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.event_participant
    ADD CONSTRAINT event_participant_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.invite
    ADD CONSTRAINT invite_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.jwks
    ADD CONSTRAINT jwks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mail_directory_entry
    ADD CONSTRAINT mail_directory_entry_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mail_jmap_sync_state
    ADD CONSTRAINT mail_jmap_sync_state_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mail_vault_backup
    ADD CONSTRAINT mail_vault_backup_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notification_job
    ADD CONSTRAINT notification_job_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oauth_access_token
    ADD CONSTRAINT oauth_access_token_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oauth_client
    ADD CONSTRAINT oauth_client_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oauth_consent
    ADD CONSTRAINT oauth_consent_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oauth_refresh_token
    ADD CONSTRAINT oauth_refresh_token_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.passkey
    ADD CONSTRAINT passkey_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.push_device
    ADD CONSTRAINT push_device_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rate_limit
    ADD CONSTRAINT rate_limit_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.recurrence_exception
    ADD CONSTRAINT recurrence_exception_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_encryption_device
    ADD CONSTRAINT user_encryption_device_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_encryption_password
    ADD CONSTRAINT user_encryption_password_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_mail_settings
    ADD CONSTRAINT user_mail_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_recent_contacts
    ADD CONSTRAINT user_recent_contacts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX account_provider_id_account_id_key ON public.account USING btree (provider_id, account_id);

CREATE INDEX calendar_event_blind_index_tokens_gin_idx ON public.calendar_event USING gin (((blind_index_tokens)::jsonb));

CREATE INDEX calendar_event_external_id_subscription_id_idx ON public.calendar_event USING btree (external_id, subscription_id);

CREATE INDEX calendar_event_is_synced_subscription_id_idx ON public.calendar_event USING btree (is_synced, subscription_id);

CREATE INDEX calendar_event_stalwart_account_id_stalwart_calendar_id_idx ON public.calendar_event USING btree (stalwart_account_id, stalwart_calendar_id);

CREATE INDEX calendar_event_user_id_recurrence_parent_event_id_idx ON public.calendar_event USING btree (user_id, recurrence, parent_event_id);

CREATE UNIQUE INDEX calendar_event_user_id_stalwart_event_id_key ON public.calendar_event USING btree (user_id, stalwart_event_id);

CREATE INDEX calendar_event_user_id_start_end_idx ON public.calendar_event USING btree (user_id, start, "end");

CREATE UNIQUE INDEX calendar_ics_share_token_key ON public.calendar USING btree (ics_share_token);

CREATE UNIQUE INDEX calendar_sharing_calendar_id_shared_with_key ON public.calendar_sharing USING btree (calendar_id, shared_with);

CREATE INDEX calendar_stalwart_account_id_idx ON public.calendar USING btree (stalwart_account_id);

CREATE INDEX calendar_subscription_is_active_last_sync_at_idx ON public.calendar_subscription USING btree (is_active, last_sync_at);

CREATE UNIQUE INDEX calendar_subscription_user_id_url_key ON public.calendar_subscription USING btree (user_id, url);

CREATE INDEX calendar_sync_log_status_started_at_idx ON public.calendar_sync_log USING btree (status, started_at);

CREATE INDEX calendar_sync_log_subscription_id_started_at_idx ON public.calendar_sync_log USING btree (subscription_id, started_at);

CREATE UNIQUE INDEX calendar_user_id_stalwart_calendar_id_key ON public.calendar USING btree (user_id, stalwart_calendar_id);

CREATE INDEX event_category_user_id_idx ON public.event_category USING btree (user_id);

CREATE UNIQUE INDEX event_participant_event_id_email_key ON public.event_participant USING btree (event_id, email);

CREATE INDEX event_participant_event_id_user_id_idx ON public.event_participant USING btree (event_id, user_id);

CREATE INDEX idx_event_notification_event_type ON public.event_notification USING btree (event_id, notification_type);

CREATE INDEX idx_event_notification_sent_created ON public.event_notification USING btree (is_sent, created_at);

CREATE INDEX idx_event_notification_time_enabled_sent ON public.event_notification USING btree (notification_time, is_enabled, is_sent);

CREATE INDEX idx_notification_job_status_available ON public.notification_job USING btree (status, available_at);

CREATE INDEX idx_notification_job_user_kind_status ON public.notification_job USING btree (user_id, kind, channel, status);

CREATE INDEX idx_notification_log_failed ON public.notification_log USING btree (status, created_at);

CREATE INDEX idx_notification_log_sent_at_status ON public.notification_log USING btree (sent_at, status);

CREATE INDEX idx_notification_log_user_sent ON public.notification_log USING btree (user_id, sent_at);

CREATE INDEX invite_email_idx ON public.invite USING btree (email);

CREATE INDEX invite_invited_by_id_idx ON public.invite USING btree (invited_by_id);

CREATE INDEX invite_status_idx ON public.invite USING btree (status);

CREATE UNIQUE INDEX invite_token_key ON public.invite USING btree (token);

CREATE INDEX mail_directory_entry_domain_local_part_idx ON public.mail_directory_entry USING btree (domain, local_part);

CREATE UNIQUE INDEX mail_directory_entry_email_key ON public.mail_directory_entry USING btree (email);

CREATE INDEX mail_directory_entry_linked_cover_idx ON public.mail_directory_entry USING btree (user_id) INCLUDE (id, email, stalwart_account_id) WHERE (user_id IS NOT NULL);

CREATE UNIQUE INDEX mail_directory_entry_stalwart_account_id_key ON public.mail_directory_entry USING btree (stalwart_account_id);

CREATE UNIQUE INDEX mail_directory_entry_user_id_key ON public.mail_directory_entry USING btree (user_id);

CREATE UNIQUE INDEX mail_jmap_sync_state_directory_entry_id_key ON public.mail_jmap_sync_state USING btree (directory_entry_id);

CREATE UNIQUE INDEX mail_jmap_sync_state_stalwart_account_id_key ON public.mail_jmap_sync_state USING btree (stalwart_account_id);

CREATE UNIQUE INDEX mail_vault_backup_directory_entry_id_key ON public.mail_vault_backup USING btree (directory_entry_id);

CREATE UNIQUE INDEX notification_job_pending_new_mail_email_idx ON public.notification_job USING btree (user_id, ((payload ->> 'emailId'::text))) WHERE ((kind = 'new_mail'::text) AND (channel = 'push'::text) AND (status = 'pending'::text) AND ((payload ->> 'emailId'::text) IS NOT NULL));

CREATE INDEX notification_log_event_id_user_id_idx ON public.notification_log USING btree (event_id, user_id);

CREATE INDEX oauth_access_token_client_id_idx ON public.oauth_access_token USING btree (client_id);

CREATE INDEX oauth_access_token_refresh_id_idx ON public.oauth_access_token USING btree (refresh_id);

CREATE INDEX oauth_access_token_session_id_idx ON public.oauth_access_token USING btree (session_id);

CREATE UNIQUE INDEX oauth_access_token_token_key ON public.oauth_access_token USING btree (token);

CREATE INDEX oauth_access_token_user_id_idx ON public.oauth_access_token USING btree (user_id);

CREATE UNIQUE INDEX oauth_client_client_id_key ON public.oauth_client USING btree (client_id);

CREATE INDEX oauth_client_reference_id_idx ON public.oauth_client USING btree (reference_id);

CREATE INDEX oauth_client_user_id_idx ON public.oauth_client USING btree (user_id);

CREATE INDEX oauth_consent_client_id_user_id_idx ON public.oauth_consent USING btree (client_id, user_id);

CREATE INDEX oauth_consent_reference_id_idx ON public.oauth_consent USING btree (reference_id);

CREATE INDEX oauth_refresh_token_client_id_idx ON public.oauth_refresh_token USING btree (client_id);

CREATE INDEX oauth_refresh_token_session_id_idx ON public.oauth_refresh_token USING btree (session_id);

CREATE UNIQUE INDEX oauth_refresh_token_token_key ON public.oauth_refresh_token USING btree (token);

CREATE INDEX oauth_refresh_token_user_id_idx ON public.oauth_refresh_token USING btree (user_id);

CREATE UNIQUE INDEX push_device_token_hash_key ON public.push_device USING btree (token_hash);

CREATE INDEX push_device_user_id_is_enabled_idx ON public.push_device USING btree (user_id, is_enabled);

CREATE UNIQUE INDEX push_device_user_id_token_hash_key ON public.push_device USING btree (user_id, token_hash);

CREATE INDEX rate_limit_last_request_idx ON public.rate_limit USING btree (last_request);

CREATE UNIQUE INDEX recurrence_exception_parent_event_id_exception_date_key ON public.recurrence_exception USING btree (parent_event_id, exception_date);

CREATE UNIQUE INDEX session_token_key ON public.session USING btree (token);

CREATE UNIQUE INDEX user_avatar_id_key ON public."user" USING btree (avatar_id);

CREATE UNIQUE INDEX user_email_key ON public."user" USING btree (email);

CREATE UNIQUE INDEX user_encryption_device_user_id_device_id_key ON public.user_encryption_device USING btree (user_id, device_id);

CREATE INDEX user_encryption_device_user_id_last_seen_at_idx ON public.user_encryption_device USING btree (user_id, last_seen_at);

CREATE UNIQUE INDEX user_encryption_password_user_id_key ON public.user_encryption_password USING btree (user_id);

CREATE UNIQUE INDEX user_mail_settings_user_id_key ON public.user_mail_settings USING btree (user_id);

CREATE UNIQUE INDEX user_pending_avatar_id_key ON public."user" USING btree (pending_avatar_id);

CREATE UNIQUE INDEX user_recent_contacts_user_id_key ON public.user_recent_contacts USING btree (user_id);

CREATE UNIQUE INDEX user_settings_user_id_key ON public.user_settings USING btree (user_id);

CREATE UNIQUE INDEX verification_identifier_key ON public.verification USING btree (identifier);

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.calendar_event
    ADD CONSTRAINT calendar_event_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.calendar(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.calendar_event
    ADD CONSTRAINT calendar_event_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.event_category(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.calendar_event
    ADD CONSTRAINT calendar_event_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.calendar_sharing
    ADD CONSTRAINT calendar_sharing_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.calendar(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.calendar_subscription
    ADD CONSTRAINT calendar_subscription_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.calendar(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.calendar_subscription
    ADD CONSTRAINT calendar_subscription_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.calendar_sync_log
    ADD CONSTRAINT calendar_sync_log_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.calendar_subscription(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.calendar
    ADD CONSTRAINT calendar_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.event_category
    ADD CONSTRAINT event_category_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.event_notification
    ADD CONSTRAINT event_notification_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.calendar_event(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.event_participant
    ADD CONSTRAINT event_participant_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.calendar_event(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.event_participant
    ADD CONSTRAINT event_participant_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.invite
    ADD CONSTRAINT invite_invited_by_id_fkey FOREIGN KEY (invited_by_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.mail_directory_entry
    ADD CONSTRAINT mail_directory_entry_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.mail_jmap_sync_state
    ADD CONSTRAINT mail_jmap_sync_state_directory_entry_id_fkey FOREIGN KEY (directory_entry_id) REFERENCES public.mail_directory_entry(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.mail_vault_backup
    ADD CONSTRAINT mail_vault_backup_directory_entry_id_fkey FOREIGN KEY (directory_entry_id) REFERENCES public.mail_directory_entry(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.notification_job
    ADD CONSTRAINT notification_job_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_access_token
    ADD CONSTRAINT oauth_access_token_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.oauth_client(client_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_access_token
    ADD CONSTRAINT oauth_access_token_refresh_id_fkey FOREIGN KEY (refresh_id) REFERENCES public.oauth_refresh_token(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.oauth_access_token
    ADD CONSTRAINT oauth_access_token_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.oauth_access_token
    ADD CONSTRAINT oauth_access_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_client
    ADD CONSTRAINT oauth_client_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_consent
    ADD CONSTRAINT oauth_consent_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.oauth_client(client_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_consent
    ADD CONSTRAINT oauth_consent_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_refresh_token
    ADD CONSTRAINT oauth_refresh_token_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.oauth_client(client_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_refresh_token
    ADD CONSTRAINT oauth_refresh_token_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.oauth_refresh_token
    ADD CONSTRAINT oauth_refresh_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.passkey
    ADD CONSTRAINT "passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.push_device
    ADD CONSTRAINT push_device_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.recurrence_exception
    ADD CONSTRAINT recurrence_exception_modified_event_id_fkey FOREIGN KEY (modified_event_id) REFERENCES public.calendar_event(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.user_encryption_device
    ADD CONSTRAINT user_encryption_device_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.user_encryption_password
    ADD CONSTRAINT user_encryption_password_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.user_mail_settings
    ADD CONSTRAINT user_mail_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.user_recent_contacts
    ADD CONSTRAINT user_recent_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON UPDATE CASCADE ON DELETE CASCADE;
