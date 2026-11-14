import { describe, expect, it } from 'vitest';
import {
  formatMarsCoord,
  marsBearingDeg,
  marsDistanceM,
  mercatorTilePixelToLat,
  normalizeLon180,
  normalizeLon360,
  planetocentricToPlanetographicLat,
  planetographicToPlanetocentricLat,
  pointInGeoJsonPolygon,
} from '../shared/geo';

describe('Mars Geodesy & CRS Utilities', () => {
  it('normalizes east longitudes cleanly between [-180, 180] and [0, 360)', () => {
    expect(normalizeLon180(200)).toBe(-160);
    expect(normalizeLon180(137.3889)).toBeCloseTo(137.3889, 4);
    expect(normalizeLon360(-22.6)).toBeCloseTo(337.4, 4);
  });

  it('round-trips planetocentric <-> planetographic latitude accurately', () => {
    for (const latC of [-45, -4.775, 0, 18.4, 62.1]) {
      const latG = planetocentricToPlanetographicLat(latC);
      const back = planetographicToPlanetocentricLat(latG);
      expect(back).toBeCloseTo(latC, 9);
    }
    // Mid-latitudes on oblate Mars have slightly higher planetographic magnitude
    expect(Math.abs(planetocentricToPlanetographicLat(-30))).toBeGreaterThan(30);
  });

  it('computes Gale Crater geodesic distances and bearings using R=3,389.5 km', () => {
    const a: [number, number] = [137.3889, -4.826];
    const b: [number, number] = [137.3989, -4.826];
    const dist = marsDistanceM(a, b);
    // 0.01 deg lon at -4.8 deg lat on Mars (~59 km/deg * 0.01 = ~590 m)
    expect(dist).toBeGreaterThan(580);
    expect(dist).toBeLessThan(600);
    expect(marsBearingDeg(a, b)).toBeCloseTo(90, 0);
  });

  it('detects point-in-polygon including inner rings/holes', () => {
    const poly: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
      ],
    };
    expect(pointInGeoJsonPolygon([1, 1], poly)).toBe(true);
    expect(pointInGeoJsonPolygon([5, 5], poly)).toBe(false); // in hole
    expect(pointInGeoJsonPolygon([12, 5], poly)).toBe(false);
  });

  it('maps Web Mercator tile y pixel cleanly to planetocentric latitude', () => {
    expect(mercatorTilePixelToLat(1, 1, 0)).toBeCloseTo(0, 6);
    expect(mercatorTilePixelToLat(1, 0, 0)).toBeGreaterThan(80);
  });

  it('formats Mars coordinates with hemisphere indicators', () => {
    expect(formatMarsCoord(137.3889, -4.826, 3)).toBe('4.826°S, 137.389°E');
  });
});
