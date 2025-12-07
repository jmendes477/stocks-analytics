import { createPool } from '@vercel/postgres';

type PoolType = ReturnType<typeof createPool>;

let pool: PoolType | null = null;

function getPool(): PoolType | null {
    if (pool) return pool;
    const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL;
    if (!conn) {
        // Don't throw at import time — return null and let callers handle missing config.
        console.warn('DATABASE_URL / POSTGRES_URL not set; Postgres pool not created');
        return null;
    }
    pool = createPool({ connectionString: conn });
    return pool;
}

export async function query(text: string, params?: any[]) {
    const p = getPool();
    if (!p) {
        throw new Error('DATABASE_URL (or POSTGRES_URL) is not configured');
    }
    const client = await p.connect();
    try {
        const res = await client.query(text, params);
        return res;
    } finally {
        client.release();
    }
}