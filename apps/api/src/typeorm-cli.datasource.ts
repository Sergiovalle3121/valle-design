import { join } from 'path';
import { DataSource } from 'typeorm';

const isProd = process.env.NODE_ENV === 'production';
const url = process.env.DATABASE_URL;
const dbHost = process.env.DB_HOST;
const globPath = (...parts: string[]) => join(...parts).replace(/\\/g, '/');

if (!url && !dbHost) {
  throw new Error(
    'TypeORM migrations require a PostgreSQL connection. Set DATABASE_URL or DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE.',
  );
}

const sslEnabled = isProd || url?.includes('sslmode=require');

export default new DataSource({
  type: 'postgres',
  url,
  host: dbHost,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: String(process.env.DB_PASSWORD ?? ''),
  database: process.env.DB_DATABASE,
  ssl: sslEnabled
    ? { rejectUnauthorized: process.env.DB_SSL_STRICT === 'true' }
    : false,
  synchronize: false,
  entities: [globPath(__dirname, 'modules', '**', '*.entity.{ts,js}')],
  migrations: [globPath(__dirname, 'migrations', '!(*.spec).{ts,js}')],
});
