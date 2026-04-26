import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  throw new Error('POSTGRES_URL_NON_POOLING is not set');
}

const client = postgres(url, { max: 1, prepare: false });
export const db = drizzle(client, { schema });
export * from './schema';
