export const JSON_COLUMN_TYPE: 'jsonb' | 'simple-json' =
  process.env.DATABASE_URL || process.env.DB_HOST ? 'jsonb' : 'simple-json';
