import { NextRequest } from 'next/server';
import { supabaseServer } from './supabaseServer';

export async function requireUser(request: NextRequest): Promise<{ id: string; email?: string }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing Authorization header');
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw new Error('Empty Authorization token');
  }

  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) {
    throw new Error('Unauthorized');
  }

  return { id: data.user.id, email: data.user.email ?? undefined };
}
