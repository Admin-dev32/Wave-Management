import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCache, setCache } from '../../../../../lib/cache';
import { ensureInternalSecret, toErrorResponse } from '../../../../../lib/errors';
import { resolveBusiness } from '../../../../../lib/resolveBusiness';
import { createProduct, findProducts } from '../../../../../lib/wave';

const TTL = 15 * 60 * 1000;

const bodySchema = z.object({
  businessId: z.string().optional(),
  businessName: z.string().optional(),
  name: z.string(),
  unitPrice: z.number().optional(),
  description: z.string().optional(),
  incomeAccountId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    ensureInternalSecret(req);
    const json = await req.json();
    const body = bodySchema.parse(json);
    const requestId = req.headers.get('x-request-id') ?? undefined;
    const { business } = await resolveBusiness({ businessId: body.businessId, businessName: body.businessName }, requestId);

    const cacheKey = `products:${business.id}:${body.name.toLowerCase()}`;
    let existing = getCache<Awaited<ReturnType<typeof findProducts>>>(cacheKey);
    if (!existing) {
      existing = await findProducts(business.id, body.name, requestId);
      setCache(cacheKey, existing, TTL);
    }
    const match = existing.find((p) => p.name.toLowerCase() === body.name.toLowerCase());
    if (match) {
      return NextResponse.json({ ok: true, created: false, productId: match.id, product: match });
    }

    const product = await createProduct({ ...body, businessId: business.id }, requestId);
    return NextResponse.json({ ok: true, created: true, productId: product.id, product });
  } catch (error) {
    return toErrorResponse(error);
  }
}
