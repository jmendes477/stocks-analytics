import { createPool } from '@vercel/postgres';

// createPool accepts a config object. Pass the connection string under
// `connectionString` so TypeScript matches the expected `VercelPostgresPoolConfig`.
const pool = createPool({ connectionString: process.env.DATABASE_URL });
export async function query(text: string, params?: any[]) {
    const client = await pool.connect();
    try {
        const res = await client.query(text, params);
        return res;
    } finally {
        client.release();
    }
}