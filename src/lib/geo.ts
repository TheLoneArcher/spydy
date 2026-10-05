export function parsePoint(pt: unknown): [number, number] | null {
  if (!pt) return null;

  if (typeof pt === 'object' && pt !== null && 'type' in pt && 'coordinates' in pt) {
    const point = pt as { type?: unknown; coordinates?: unknown };
    if (point.type === 'Point' && Array.isArray(point.coordinates) && point.coordinates.length >= 2) {
      return [Number(point.coordinates[1]), Number(point.coordinates[0])];
    }
  }

  if (typeof pt === 'string' && pt.startsWith('POINT')) {
    const match = pt.match(/\(([^ ]+)\s+([^)]+)\)/);
    if (match) return [Number(match[2]), Number(match[1])];
  }

  if (typeof pt === 'string' && pt.startsWith('0101000020E6100000')) {
    try {
      const bytes = pt.match(/../g)?.map(byte => parseInt(byte, 16));
      if (!bytes) return null;
      const view = new DataView(new Uint8Array(bytes).buffer);
      return [view.getFloat64(17, true), view.getFloat64(9, true)];
    } catch {
      return null;
    }
  }

  return null;
}
