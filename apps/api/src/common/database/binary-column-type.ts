export const BINARY_COLUMN_TYPE: 'bytea' | 'blob' =
  process.env.DATABASE_URL || process.env.DB_HOST ? 'bytea' : 'blob';
