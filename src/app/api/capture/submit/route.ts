import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getSupabaseServerClient, getSupabaseAdminClient } from '@/lib/server/supabase';
import { computeDHash, computeSha256, isJpegBuffer, stripExifAndNormalize } from '@/lib/server/phash';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

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

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'Multipart form data is required' }, { status: 400 });
    }

    const photoFile = formData.get('photo') as File | null;
    const nonce = formData.get('nonce') as string | null;
    const latStr = formData.get('lat') as string | null;
    const lonStr = formData.get('lon') as string | null;
    const accuracyStr = formData.get('accuracy') as string | null;
    const isAfter = formData.get('is_after') === 'true';

    if (!photoFile || !nonce || !latStr || !lonStr) {
      return NextResponse.json(
        { error: 'Photo, challenge nonce, and GPS coordinates are required' },
        { status: 400 }
      );
    }

    const lat = Number(latStr);
    const lon = Number(lonStr);
    const accuracy = accuracyStr ? Number(accuracyStr) : 0;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: 'Invalid coordinates provided' }, { status: 400 });
    }

    // 1. Accuracy check: reject if accuracy is worse than 1000 meters
    if (accuracy > 1000) {
      return NextResponse.json(
        { error: `GPS accuracy is too low (${Math.round(accuracy)}m). Please move outdoors for a clear satellite lock.` },
        { status: 400 }
      );
    }

    const adminClient = getSupabaseAdminClient();

    // 2. Atomically claim a fresh nonce so concurrent submissions cannot replay it.
    const { data: challenge, error: chalErr } = await adminClient
      .from('capture_challenges')
      .update({ used: true })
      .eq('nonce', nonce)
      .eq('user_id', user.id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .select('nonce')
      .maybeSingle();

    if (chalErr || !challenge) {
      return NextResponse.json({ error: 'Invalid or missing capture challenge nonce' }, { status: 403 });
    }

    // 3. Service area boundary check via DB RPC
    const { data: inArea, error: areaErr } = await adminClient.rpc('in_service_area', {
      p_lat: lat,
      p_lon: lon,
    });

    if (areaErr || !inArea) {
      return NextResponse.json(
        { error: 'Coordinates are outside the municipal service area.' },
        { status: 400 }
      );
    }

    // 4. File size check (max 6 MB)
    if (photoFile.size > 6 * 1024 * 1024) {
      return NextResponse.json({ error: 'Photo exceeds maximum allowed size (6 MB)' }, { status: 400 });
    }

    const rawBuffer = Buffer.from(await photoFile.arrayBuffer());

    // 5. File type check via magic bytes (JPEG only)
    if (!isJpegBuffer(rawBuffer)) {
      return NextResponse.json(
        { error: 'Invalid image format. Only authentic camera JPEG captures are accepted.' },
        { status: 400 }
      );
    }

    // 6. Strip EXIF metadata & compute hashes
    const normalizedBuffer = await stripExifAndNormalize(rawBuffer);
    const sha256 = computeSha256(normalizedBuffer);
    const phashBigInt = await computeDHash(normalizedBuffer);

    // 7. Reject exact sha256 duplicate (identical photo already submitted)
    const { data: existingDup } = await adminClient
      .from('report_media')
      .select('id')
      .eq('sha256', sha256)
      .maybeSingle();

    if (existingDup) {
      return NextResponse.json(
        { error: 'This exact photo has already been submitted previously.' },
        { status: 409 }
      );
    }

    // 8. Upload to private report-media bucket
    const mediaId = randomUUID();
    const storagePath = `${user.id}/${mediaId}.jpg`;

    const { error: uploadErr } = await adminClient.storage
      .from('report-media')
      .upload(storagePath, normalizedBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadErr) {
      logger.error('Failed to store camera capture in report-media bucket', uploadErr);
      return NextResponse.json({ error: 'Failed to securely store captured evidence.' }, { status: 500 });
    }

    // 9. Insert record into report_media
    const { error: mediaErr } = await adminClient.from('report_media').insert({
      id: mediaId,
      uploaded_by: user.id,
      kind: isAfter ? 'after' : 'original',
      storage_path: storagePath,
      sha256,
      phash: phashBigInt.toString(),
      phash_bigint: BigInt.asIntN(64, phashBigInt).toString(),
      lat,
      lng: lon,
      accuracy_m: accuracy,
      captured_at: new Date().toISOString(),
      capture_nonce: nonce,
      verified: true,
      exif_stripped: true,
      is_after: isAfter,
    } as any);

    if (mediaErr) {
      logger.error('Failed to insert report_media record', mediaErr);
      return NextResponse.json({ error: 'Failed to record verified media metadata' }, { status: 500 });
    }

    return NextResponse.json({
      media_id: mediaId,
      phash: phashBigInt.toString(),
      path: storagePath,
      verified: true,
    });
  } catch (err: unknown) {
    logger.error('Error in POST /api/capture/submit', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error during verification' },
      { status: 500 }
    );
  }
}
