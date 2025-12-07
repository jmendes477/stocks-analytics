import { Redis } from '@upstash/redis';

let redis: any;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL as string,
        token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
    });
} else {
    // Provide a no-op stub so builds that collect data won't fail when Redis isn't configured.
    console.warn('UPSTASH_REDIS_REST_URL/TOKEN not set; using Redis noop stub');
    redis = {
        get: async (_: string) => null,
        set: async (_: string, __: any) => null,
        del: async (_: string) => null,
    };
}

export { redis };