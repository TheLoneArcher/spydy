import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseAdminClient } from '@/lib/server/supabase';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const signSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(20),
});

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

    const body = await req.json().catch(() => null);
    const parsed = signSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input. paths must be an array of 1 to 20 strings.' }, { status: 400 });
    }

    const requestedPaths = parsed.data.paths;
    const urlMap: Record<string, string> = {};
    const storagePathsToSign: string[] = [];

    for (const p of requestedPaths) {
      if (p.startsWith('http://') || p.startsWith('https://')) {
        urlMap[p] = p;
      } else if (p.startsWith('/demo/')) {
        urlMap[p] = p;
      } else {
        storagePathsToSign.push(p.startsWith('/') ? p.slice(1) : p);
      }
    }

    if (storagePathsToSign.length > 0) {
      // Check caller's permission via userClient RLS on report_media
      const { data: allowedRows } = await userClient
        .from('report_media')
        .select('storage_path')
        .in('storage_path', storagePathsToSign);

      const allowedSet = new Set((allowedRows || []).map((r: any) => r.storage_path));

      // Also allow demo/ paths for seeded data
      for (const p of storagePathsToSign) {
        if (p.startsWith('demo/')) {
          allowedSet.add(p);
        }
      }

      const pathsPermitted = storagePathsToSign.filter(p => allowedSet.has(p));

      if (pathsPermitted.length > 0) {
        const adminClient = getSupabaseAdminClient();
        const { data: signedData, error: signErr } = await adminClient.storage
          .from('report-media')
          .createSignedUrls(pathsPermitted, 600); // 10 minutes

        if (!signErr && signedData) {
          for (const item of signedData) {
            if (item.signedUrl && item.path) {
              urlMap[item.path] = item.signedUrl;
              // Also map with leading slash if requested
              urlMap[`/${item.path}`] = item.signedUrl;
            }
          }
        }
      }
    }

    return NextResponse.json({ urls: urlMap });
  } catch (err: unknown) {
    logger.error('Error in POST /api/media/sign', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
