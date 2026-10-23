// The first setup file of core, api and mcp. Their tests delete rows after each test,
// and without .env.test their loadEnv('test') falls back to .env — the dev DB.
// So no test file starts unless DATABASE_URL names a *_test database.
const url = process.env.DATABASE_URL;
const name = url ? new URL(url).pathname.slice(1) : '';

if (!name.endsWith('_test')) {
  throw new Error(
    `Tests refuse database "${name || 'DATABASE_URL is not set'}": only a *_test one. ` +
      'Copy .env.test.example to .env.test.',
  );
}
