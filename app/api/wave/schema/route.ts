import { NextRequest, NextResponse } from 'next/server';
import { ensureInternalSecret, toErrorResponse } from '../../../../lib/errors';
import { fetchWaveSchema } from '../../../../lib/wave';

export async function GET(req: NextRequest) {
  try {
    ensureInternalSecret(req);
    const requestId = req.headers.get('x-request-id') ?? undefined;
    const schema = await fetchWaveSchema(requestId);
    return NextResponse.json({ ok: true, schema });
  } catch (error) {
    return toErrorResponse(error);
  }
}
