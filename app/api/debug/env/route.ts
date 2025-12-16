import { NextResponse } from 'next/server';
import { ensureInternalSecret, toErrorResponse } from '../../../../lib/errors';

export async function GET(request: Request) {
  try {
    ensureInternalSecret(request);
    const hasWaveToken = Boolean(process.env.WAVE_ACCESS_TOKEN);
    const hasInternalSecret = Boolean(process.env.INTERNAL_API_SECRET);
    return NextResponse.json({ hasWaveToken, hasInternalSecret });
  } catch (error) {
    return toErrorResponse(error);
  }
}
