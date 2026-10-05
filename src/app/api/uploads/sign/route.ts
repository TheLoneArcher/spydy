import { createHmac, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';

const requestSchema = z.object({ reportId: z.string().uuid(), mime: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg') });

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 });

  const expiresAt = Date.now() + 10 * 60 * 1000;
  const nonce = `${expiresAt}.${randomUUID()}`;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!secret) return NextResponse.json({ error: 'Upload signing is not configured.' }, { status: 503 });
  const signature = createHmac('sha256', secret).update(`${user.id}:${parsed.data.reportId}:${nonce}`).digest('hex');
  const path = `${parsed.data.reportId}/${user.id}/${randomUUID()}`;
  const { data: upload, error } = await supabase.storage.from('report-media').createSignedUploadUrl(path);
  if (error || !upload) return NextResponse.json({ error: 'Could not create upload URL.' }, { status: 502 });
  return NextResponse.json({ path, token: upload.token, nonce, signature, expiresAt, mime: parsed.data.mime });
}
