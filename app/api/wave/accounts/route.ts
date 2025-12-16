import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCache, setCache } from '../../../../lib/cache';
import { ensureInternalSecret, toErrorResponse } from '../../../../lib/errors';
import { resolveBusiness } from '../../../../lib/resolveBusiness';
import { fetchAccounts } from '../../../../lib/wave';

const TTL = 15 * 60 * 1000;

const querySchema = z.object({
  businessId: z.string().optional(),
  businessName: z.string().optional(),
  types: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    ensureInternalSecret(req);
    const parsed = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const requestId = req.headers.get('x-request-id') ?? undefined;
    const resolved = await resolveBusiness({ businessId: parsed.businessId, businessName: parsed.businessName }, requestId);
    const types = parsed.types?.split(',').filter(Boolean);
    const cacheKey = `accounts:${resolved.business.id}:${types?.join(',') ?? 'all'}`;
    let accounts = getCache<Awaited<ReturnType<typeof fetchAccounts>>>(cacheKey);
    if (!accounts) {
      accounts = await fetchAccounts(resolved.business.id, types, requestId);
      setCache(cacheKey, accounts, TTL);
    }
    return NextResponse.json({ ok: true, business: resolved.business, accounts });
  } catch (error) {
    return toErrorResponse(error);
  }
}
