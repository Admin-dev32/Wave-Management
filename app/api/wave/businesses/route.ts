import { NextRequest, NextResponse } from 'next/server';
import { getCache, setCache } from '../../../../lib/cache';
import { ensureInternalSecret, toErrorResponse } from '../../../../lib/errors';
import { fetchBusinesses } from '../../../../lib/wave';

const TTL = 15 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    ensureInternalSecret(req);
    const requestId = req.headers.get('x-request-id') ?? undefined;
    const cacheKey = 'businesses';
    let businesses = getCache<typeof fetchBusinesses extends (...args: any[]) => Promise<infer R> ? R : unknown>(cacheKey);
    if (!businesses) {
      businesses = await fetchBusinesses(requestId);
      setCache(cacheKey, businesses, TTL);
    }
    return NextResponse.json({ ok: true, businesses });
  } catch (error) {
    return toErrorResponse(error);
  }
}
