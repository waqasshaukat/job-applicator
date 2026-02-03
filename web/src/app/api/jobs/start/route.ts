import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';

const workerUrl = process.env.WORKER_URL;

export async function POST(request: NextRequest) {
  if (!workerUrl) {
    return NextResponse.json({ error: 'WORKER_URL is not configured.' }, { status: 500 });
  }

  try {
    await requireUser(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const response = await fetch(`${workerUrl}/jobs/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
