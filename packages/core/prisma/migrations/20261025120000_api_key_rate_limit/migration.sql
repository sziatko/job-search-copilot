-- The api-key plugin copies its rate limit onto a key when the key is created, and
-- reads it from the row after that: the keys made while it was off get the limit now.
-- Keep in step with API_KEY_OPTIONS (src/auth/api-key.ts). One statement, so atomic.
UPDATE "Apikey"
SET "rateLimitEnabled" = true, "rateLimitTimeWindow" = 3600000, "rateLimitMax" = 1000;
