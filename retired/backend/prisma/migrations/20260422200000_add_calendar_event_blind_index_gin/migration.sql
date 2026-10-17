CREATE INDEX "calendar_event_blind_index_tokens_gin_idx"
ON "calendar_event"
USING GIN (("blind_index_tokens"::jsonb));