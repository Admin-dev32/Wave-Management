import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCache, setCache } from '../../../../../lib/cache';
import { ensureInternalSecret, toErrorResponse } from '../../../../../lib/errors';
import { resolveBusiness } from '../../../../../lib/resolveBusiness';
import { rankExpenseAccounts } from '../../../../../lib/suggestAccounts';
import { fetchAccounts } from '../../../../../lib/wave';

const TTL = 15 * 60 * 1000;

const bodySchema = z.object({
  businessId: z.string().optional(),
  businessName: z.string().optional(),
  text: z.string().optional(),
  amount: z.number().positive(),
  vendor: z.string().optional(),
  categoryHint: z.string().optional(),
  topK: z.number().min(1).max(10).optional(),
});

export async function POST(req: NextRequest) {
  try {
    ensureInternalSecret(req);
    const body = bodySchema.parse(await req.json());
    const requestId = req.headers.get('x-request-id') ?? undefined;
    const { business } = await resolveBusiness({ businessId: body.businessId, businessName: body.businessName }, requestId);
    const cacheKey = `accounts:${business.id}:EXPENSE:`;
    let accounts = getCache<Awaited<ReturnType<typeof fetchAccounts>>>(cacheKey);
    if (!accounts) {
      accounts = await fetchAccounts(business.id, ['EXPENSE'], undefined, requestId);
      setCache(cacheKey, accounts, TTL);
    }
    const suggestions = rankExpenseAccounts(accounts, {
      text: body.text,
      vendor: body.vendor,
      categoryHint: body.categoryHint,
      topK: body.topK,
    });
    return NextResponse.json({ ok: true, business, suggestions });
  } catch (error) {
    return toErrorResponse(error);
  }
}
