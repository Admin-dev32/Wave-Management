import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCache, setCache } from '../../../../../lib/cache';
import { ensureInternalSecret, toErrorResponse } from '../../../../../lib/errors';
import { resolveBusiness } from '../../../../../lib/resolveBusiness';
import { createCustomer, findCustomers } from '../../../../../lib/wave';

const TTL = 5 * 60 * 1000;

const bodySchema = z.object({
  businessId: z.string().optional(),
  businessName: z.string().optional(),
  name: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  currency: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    ensureInternalSecret(req);
    const json = await req.json();
    const body = bodySchema.parse(json);
    const requestId = req.headers.get('x-request-id') ?? undefined;
    const { business } = await resolveBusiness({ businessId: body.businessId, businessName: body.businessName }, requestId);

    const cacheKey = `customers:${business.id}:${(body.email || body.name).toLowerCase()}`;
    let existing = getCache<Awaited<ReturnType<typeof findCustomers>>>(cacheKey);
    if (!existing) {
      existing = await findCustomers(business.id, body.email || body.name, requestId);
      setCache(cacheKey, existing, TTL);
    }
    const match = existing.find((c) => (body.email && c.email?.toLowerCase() === body.email.toLowerCase()) || c.name === body.name);
    if (match) {
      return NextResponse.json({ ok: true, created: false, customerId: match.id, customer: match });
    }

    const customer = await createCustomer({ ...body, businessId: business.id }, requestId);
    return NextResponse.json({ ok: true, created: true, customerId: customer.id, customer });
  } catch (error) {
    return toErrorResponse(error);
  }
}
