import { NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseAdminClient } from '@/lib/server/supabase';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const userClient = await getSupabaseServerClient();
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const nonce = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const adminClient = getSupabaseAdminClient();
    const { error: insertErr } = await adminClient.from('capture_challenges').insert({
      nonce,
      user_id: user.id,
      expires_at: expiresAt,
      used: false,
    });

    if (insertErr) {
      return NextResponse.json({ error: 'Could not generate capture challenge' }, { status: 500 });
    }

    return NextResponse.json({
      nonce,
      expires_at: expiresAt,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
