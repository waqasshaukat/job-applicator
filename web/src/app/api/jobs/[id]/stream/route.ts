import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const workerUrl = process.env.WORKER_URL;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!workerUrl) {
    return new Response('WORKER_URL is not configured.', { status: 500 });
  }

  try {
    await requireUser(request);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Unauthorized', { status: 401 });
  }

  const response = await fetch(`${workerUrl}/jobs/${id}/stream`, {
    headers: {
      Accept: 'text/event-stream',
    },
  });

  if (!response.ok || !response.body) {
    return new Response('Unable to connect to worker stream.', { status: 502 });
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
