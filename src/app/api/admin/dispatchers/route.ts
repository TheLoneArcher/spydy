import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseAdminClient } from '@/lib/server/supabase';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const inviteSchema = z.object({
  email: z.string().email('Valid email is required'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
});

// Simple in-memory rate limiting for invites: max 10 per hour per admin
const inviteTimestamps = new Map<string, number[]>();

function checkRateLimit(adminId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const history = (inviteTimestamps.get(adminId) || []).filter(t => now - t < windowMs);
  if (history.length >= 10) return false;
  history.push(now);
  inviteTimestamps.set(adminId, history);
  return true;
}

export async function POST(req: Request) {
  try {
    const userClient = await getSupabaseServerClient();
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Verify admin role via server client
    const { data: profile } = await userClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin' || !profile.is_active) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Invite rate limit exceeded (maximum 10 invites per hour).' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { email, fullName } = parsed.data;
    const adminClient = getSupabaseAdminClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const redirectTo = `${siteUrl}/auth/callback?next=/set-password`;

    // Invite user via Supabase Auth Admin
    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo,
    });

    if (inviteErr || !inviteData?.user) {
      logger.error('Failed to invite dispatcher', { error: inviteErr?.message });
      return NextResponse.json(
        { error: inviteErr?.message || 'Could not send invitation email.' },
        { status: 500 }
      );
    }

    const newUserId = inviteData.user.id;

    // Ensure profile exists and set role to dispatcher via admin RPC
    await adminClient.from('profiles').upsert(
      {
        id: newUserId,
        full_name: fullName,
        role: 'dispatcher',
        is_active: true,
      },
      { onConflict: 'id' }
    );

    // Call admin_set_role RPC
    await adminClient.rpc('admin_set_role', {
      p_user: newUserId,
      p_role: 'dispatcher',
    });

    // Write audit event
    await adminClient.from('report_events').insert({
      actor_id: user.id,
      kind: 'dispatcher_invite',
      message: `Admin ${user.email} invited new dispatcher ${email} (${fullName})`,
      visibility: 'staff',
    } as any);

    logger.info('Dispatcher invited successfully', { adminId: user.id, invitedEmail: email });

    return NextResponse.json({
      success: true,
      message: `Dispatcher invitation sent to ${email}`,
      user: { id: newUserId, email, fullName },
    });
  } catch (err: unknown) {
    logger.error('Error in POST /api/admin/dispatchers', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
