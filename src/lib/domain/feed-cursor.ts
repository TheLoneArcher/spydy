/**
 * Keyset cursor pagination helper for the feed
 */

export interface FeedCursor {
  id: string;
  val: string | number;
}

export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null;
  try {
    const jsonStr = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed.id === 'string' && (typeof parsed.val === 'string' || typeof parsed.val === 'number')) {
      return { id: parsed.id, val: parsed.val };
    }
    return null;
  } catch {
    return null;
  }
}
