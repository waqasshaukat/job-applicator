import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const workerUrl = process.env.WORKER_URL;

export async function GET(request: NextRequest) {
  if (!workerUrl) {
    return NextResponse.json({ error: 'WORKER_URL is not configured.' }, { status: 500 });
  }

  try {
    await requireUser(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unauthorized' }, { status: 401 });
  }

  const response = await fetch(`${workerUrl}/jobs/status`);
  const payload = await response.json().catch(() => ({}));

  return NextResponse.json(payload, { status: response.status });
}
