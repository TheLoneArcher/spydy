import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient, getSupabaseAdminClient } from '@/lib/server/supabase';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const duplicateCheckSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  title: z.string().default(''),
  category: z.string().optional(),
  phash: z.string().optional(),
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

    const body = await req.json().catch(() => ({}));
    const parsed = duplicateCheckSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
    }

    const { lat, lon, title, category, phash } = parsed.data;

    let phashBigInt: bigint | null = null;
    if (phash) {
      try {
        phashBigInt = BigInt(phash);
      } catch {
        phashBigInt = null;
      }
    }

    // Call find_similar_reports RPC
    const adminClient = getSupabaseAdminClient();
    const { data: rows, error: rpcErr } = await adminClient.rpc('find_similar_reports', {
      p_lat: lat,
      p_lon: lon,
      p_category: category || null,
      p_title: title || '',
      p_phash: phashBigInt != null ? Number(phashBigInt & BigInt(0x7fffffffffffffffn)) : null,
    });

    if (rpcErr) {
      logger.error('Error calling find_similar_reports RPC', rpcErr);
      return NextResponse.json({ candidates: [] });
    }

    const candidates = (rows || []).filter((r: any) => (r.score ?? 0) >= 0.5);

    // Generate signed URLs for candidate media
    const storagePathsToSign = candidates
      .map((c: any) => c.media_path)
      .filter((p: any) => p && !p.startsWith('http') && !p.startsWith('/demo/'));

    let signedUrlsMap: Record<string, string> = {};

    if (storagePathsToSign.length > 0) {
      const { data: signedData } = await adminClient.storage
        .from('report-media')
        .createSignedUrls(storagePathsToSign, 600);

      if (signedData) {
        for (const item of signedData) {
          if (item.signedUrl && item.path) {
            signedUrlsMap[item.path] = item.signedUrl;
          }
        }
      }
    }

    // Format output
    const formatted = candidates.map((c: any) => {
      let mediaUrl = c.media_path;
      if (c.media_path && signedUrlsMap[c.media_path]) {
        mediaUrl = signedUrlsMap[c.media_path];
      }
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        severity: c.severity,
        status: c.status,
        distance_m: Math.round(c.distance_m || 0),
        score: Math.round((c.score || 0) * 100) / 100,
        media_url: mediaUrl,
        location_label: c.location_label,
      };
    });

    return NextResponse.json({
      candidates: formatted,
    });
  } catch (err: unknown) {
    logger.error('Error in POST /api/duplicates/check', err);
    return NextResponse.json({ candidates: [] });
  }
}
