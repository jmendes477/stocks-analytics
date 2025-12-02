import { verifyRequest } from '@upstash/qstash/nextjs';


export function qstashMiddleware(req: Request) {
    // In Next.js route handlers you'd call verifyRequest(req) which throws when invalid
    return verifyRequest(req as any, process.env.QSTASH_SIGNING_KEY as string);
}