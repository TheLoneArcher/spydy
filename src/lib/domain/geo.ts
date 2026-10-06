/**
 * Pure geo utility functions
 */

export const TIRUPATI_BOUNDS = {
  minLat: 13.55,
  maxLat: 13.72,
  minLon: 79.33,
  maxLon: 79.58,
} as const;

/**
 * Client-side preliminary check for service area boundary (Tirupati)
 * The PostgreSQL database RPC is the final authority.
 */
export function isInsideServiceArea(lat: number, lon: number): boolean {
  return (
    lat >= TIRUPATI_BOUNDS.minLat &&
    lat <= TIRUPATI_BOUNDS.maxLat &&
    lon >= TIRUPATI_BOUNDS.minLon &&
    lon <= TIRUPATI_BOUNDS.maxLon
  );
}

/**
 * Haversine formula to compute great-circle distance between two points in meters
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Parse any point representation (GeoJSON object, WKB hex, or WKT POINT)
 */
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
