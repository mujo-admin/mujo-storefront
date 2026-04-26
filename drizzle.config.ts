import { config as loadEnv } from 'dotenv';
import type { Config } from 'drizzle-kit';

loadEnv({ path: '.env.local' });

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  throw new Error(
    'POSTGRES_URL_NON_POOLING missing. Run `vercel env pull .env.local` or set it in .env.local.',
  );
}

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
