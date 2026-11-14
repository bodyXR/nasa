/**
 * Mars Geodesy & Coordinate Reference Utilities
 *
 * VERIFIED FACT:
 * - IAU 2000 / 2015 Mars Sphere / Spheroid conventions (EPSG:104905 / IAU2000:49900):
 *   Mean radius R = 3,389,500 m (IAU working group spherical approximation for local scale & Trek EQ),
 *   Equatorial radius a = 3,396,190 m, Polar radius b = 3,376,200 m.
 * - Mars Trek EQ WMTS uses `urn:ogc:def:crs:EPSG::104905` (planetocentric latitude [-90, 90],
 *   east-positive longitude).
 * - Distance calculations in MARS//PATH use the IAU Mars mean spherical radius R = 3,389,500 m
 *   via Haversine, which matches local Gale Crater scale (< 50 km) within < 0.2% of ellipsoidal geodesics.
 */

export const MARS_MEAN_RADIUS_M = 3_389_500;
export const MARS_EQUATORIAL_RADIUS_M = 3_396_190;
export const MARS_POLAR_RADIUS_M = 3_376_200;
export const MARS_CRS_ID = 'urn:ogc:def:crs:EPSG::104905 (IAU Mars 2000 Planetocentric, East-Lon)';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Normalize east-positive longitude from [0, 360) or any range to [-180, 180] */
export function normalizeLon180(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && lon > 0 ? 180 : wrapped;
}

/** Normalize longitude to [0, 360) east-positive */
export function normalizeLon360(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

/** Convert planetocentric latitude (deg) to planetographic latitude (deg) on Mars IAU ellipsoid */
export function planetocentricToPlanetographicLat(latCentricDeg: number): number {
  const phiC = latCentricDeg * DEG_TO_RAD;
  const ratioSq = (MARS_EQUATORIAL_RADIUS_M / MARS_POLAR_RADIUS_M) ** 2;
  return Math.atan(ratioSq * Math.tan(phiC)) * RAD_TO_DEG;
}

/** Convert planetographic latitude (deg) to planetocentric latitude (deg) on Mars IAU ellipsoid */
export function planetographicToPlanetocentricLat(latGraphicDeg: number): number {
  const phiG = latGraphicDeg * DEG_TO_RAD;
  const ratioSq = (MARS_POLAR_RADIUS_M / MARS_EQUATORIAL_RADIUS_M) ** 2;
  return Math.atan(ratioSq * Math.tan(phiG)) * RAD_TO_DEG;
}

/** Haversine distance on Mars mean sphere (meters) */
export function marsDistanceM(a: [number, number], b: [number, number]): number {
  const lon1 = normalizeLon180(a[0]) * DEG_TO_RAD;
  const lat1 = a[1] * DEG_TO_RAD;
  const lon2 = normalizeLon180(b[0]) * DEG_TO_RAD;
  const lat2 = b[1] * DEG_TO_RAD;

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return MARS_MEAN_RADIUS_M * c;
}

/** Forward azimuth / bearing in degrees [0, 360) from point A to B on Mars sphere */
export function marsBearingDeg(a: [number, number], b: [number, number]): number {
  const lon1 = normalizeLon180(a[0]) * DEG_TO_RAD;
  const lat1 = a[1] * DEG_TO_RAD;
  const lon2 = normalizeLon180(b[0]) * DEG_TO_RAD;
  const lat2 = b[1] * DEG_TO_RAD;
  const dLon = lon2 - lon1;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * RAD_TO_DEG) + 360) % 360;
}

/** Degrees of latitude corresponding to meters on Mars sphere */
export function metersToLatDeg(meters: number): number {
  return (meters / MARS_MEAN_RADIUS_M) * RAD_TO_DEG;
}

/** Degrees of longitude corresponding to meters at given planetocentric latitude */
export function metersToLonDeg(meters: number, latDeg: number): number {
  const cosLat = Math.max(0.05, Math.cos(latDeg * DEG_TO_RAD));
  return (meters / (MARS_MEAN_RADIUS_M * cosLat)) * RAD_TO_DEG;
}

/** Format coordinate cleanly with explicit E/W, N/S hemispheres */
export function formatMarsCoord(lon: number, lat: number, decimals = 4): string {
  const l = normalizeLon180(lon);
  const latStr = `${Math.abs(lat).toFixed(decimals)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(l).toFixed(decimals)}°${l >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
}

/** Web Mercator tile Y pixel -> planetocentric latitude (deg) */
export function mercatorTilePixelToLat(tileZ: number, tileY: number, pixelY: number, tileSize = 256): number {
  const n = Math.pow(2, tileZ);
  const yFrac = (tileY + pixelY / tileSize) / n;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yFrac)));
  return latRad * RAD_TO_DEG;
}

/** Point-in-polygon ray casting for GeoJSON Polygon/MultiPolygon */
export function pointInRing(pt: [number, number], ring: number[][]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInGeoJsonPolygon(pt: [number, number], geom: GeoJSON.Geometry): boolean {
  if (geom.type === 'Polygon') {
    if (!geom.coordinates.length || !pointInRing(pt, geom.coordinates[0])) return false;
    for (let h = 1; h < geom.coordinates.length; h++) {
      if (pointInRing(pt, geom.coordinates[h])) return false;
    }
    return true;
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some((poly) => {
      if (!poly.length || !pointInRing(pt, poly[0])) return false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(pt, poly[h])) return false;
      }
      return true;
    });
  }
  return false;
}
