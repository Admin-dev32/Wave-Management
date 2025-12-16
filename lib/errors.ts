import { NextResponse } from 'next/server';

export type ErrorDetail = Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  details?: ErrorDetail;
  code?: string;

  constructor(status: number, message: string, details?: ErrorDetail, code?: string) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

export function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ApiError(500, `${name} is not set`);
  }
  return value;
}

export function ensureInternalSecret(request: Request) {
  const provided = request.headers.get('x-internal-secret');
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) {
    throw new ApiError(500, 'INTERNAL_API_SECRET is not configured');
  }
  if (!provided || provided !== expected) {
    throw new ApiError(401, 'Unauthorized');
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message,
        details: error.details,
        code: error.code,
      },
      { status: error.status },
    );
  }
  return NextResponse.json({ ok: false, message: 'Unexpected error' }, { status: 500 });
}

export function waveError(status: number, message: string, details?: ErrorDetail) {
  return new ApiError(status, message, details, 'WAVE_ERROR');
}
