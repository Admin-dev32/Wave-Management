import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ensureInternalSecret, toErrorResponse, ApiError } from '../../../../../lib/errors';
import { resolveBusiness } from '../../../../../lib/resolveBusiness';
import { suggestAnchor, rankExpenseAccounts } from '../../../../../lib/suggestAccounts';
import { createExpense, fetchAccounts } from '../../../../../lib/wave';

const bodySchema = z.object({
  businessId: z.string().optional(),
  businessName: z.string().optional(),
  date: z.string(),
  amount: z.number().positive(),
  description: z.string(),
  vendor: z.string().optional(),
  notes: z.string().optional(),
  anchorAccountId: z.string().optional(),
  expenseAccountId: z.string().optional(),
  externalId: z.string().optional(),
  categoryHint: z.string().optional(),
  text: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    ensureInternalSecret(req);
    const body = bodySchema.parse(await req.json());
    const requestId = req.headers.get('x-request-id') ?? undefined;
    const { business } = await resolveBusiness({ businessId: body.businessId, businessName: body.businessName }, requestId);

    const accounts = await fetchAccounts(business.id, undefined, requestId);
    let anchorAccountId = body.anchorAccountId;
    if (!anchorAccountId) {
      const anchorSuggestions = suggestAnchor(accounts);
      if (anchorSuggestions.length === 1 || anchorSuggestions[0]?.score > 0) {
        anchorAccountId = anchorSuggestions[0].accountId;
      } else {
        throw new ApiError(300, 'Select anchor account', { options: anchorSuggestions });
      }
    }

    let expenseAccountId = body.expenseAccountId;
    if (!expenseAccountId) {
      const suggestions = rankExpenseAccounts(accounts, {
        text: body.text || body.description,
        vendor: body.vendor,
        categoryHint: body.categoryHint,
      });
      if (suggestions[0] && suggestions[0].score >= 1) {
        expenseAccountId = suggestions[0].accountId;
      } else {
        throw new ApiError(300, 'Select expense account', { options: suggestions });
      }
    }

    const transaction = await createExpense(
      {
        businessId: business.id,
        date: body.date,
        amount: body.amount,
        description: body.description,
        notes: body.notes,
        anchorAccountId,
        expenseAccountId,
        vendor: body.vendor,
        externalId: body.externalId ?? randomUUID(),
      },
      requestId,
    );

    return NextResponse.json({
      ok: true,
      transactionId: transaction.transactionId,
      used: { businessId: business.id, anchorAccountId, expenseAccountId },
      wave: { didSucceed: true },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
