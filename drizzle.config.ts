import { defineConfig } from 'drizzle-kit';

const directUrl = process.env.DATABASE_POSTGRES_URL_NON_POOLING;

if (!directUrl) {
  throw new Error('DATABASE_POSTGRES_URL_NON_POOLING is required to run Drizzle commands');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: directUrl },
  strict: true,
  verbose: true,
});
