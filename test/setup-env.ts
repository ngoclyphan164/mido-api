process.env.NODE_ENV = 'test';
process.env.DATABASE_POSTGRES_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/mido_test';
process.env.DATABASE_SUPABASE_URL ??= 'https://mido-test.supabase.co';
