export const DATE_COLUMN_TYPE: 'timestamp' | 'datetime' =
  process.env.DATABASE_URL || process.env.DB_HOST ? 'timestamp' : 'datetime';
