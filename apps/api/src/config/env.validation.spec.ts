import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation';

const env = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
  BETTER_AUTH_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  LINKEDIN_CLIENT_ID: 'id',
  LINKEDIN_CLIENT_SECRET: 'secret',
  AUTH_ALLOWED_EMAILS: 'me@example.com',
  PASSKEY_RP_ID: 'localhost',
  MCP_PUBLIC_URL: 'http://localhost:3001/mcp',
};

describe('WEB_ORIGIN', () => {
  it('takes one bare origin', () => {
    expect(validateEnv({ ...env, WEB_ORIGIN: 'http://localhost:5173' }).WEB_ORIGIN).toBe(
      'http://localhost:5173',
    );
  });

  it.each(['https://*.example.com', 'http://localhost:5173/', 'http://localhost:5173/app'])(
    'refuses %s',
    (origin) => {
      expect(() => validateEnv({ ...env, WEB_ORIGIN: origin })).toThrow('WEB_ORIGIN');
    },
  );
});
