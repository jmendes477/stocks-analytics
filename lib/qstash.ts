export async function qstashMiddleware(req: Request) {
    // Dynamically import verify function to avoid build-time export mismatch
    try {
        const mod: any = await import('@upstash/qstash/nextjs');
        const verify = mod.verifyRequest || mod.verify || mod.default;
        if (typeof verify !== 'function') {
            throw new Error('QStash verify function not found in @upstash/qstash/nextjs');
        }
        // verify may throw when invalid
        return verify(req as any, process.env.QSTASH_SIGNING_KEY as string);
    } catch (err) {
        console.error('qstash middleware import/verify error:', err);
        throw err;
    }
}