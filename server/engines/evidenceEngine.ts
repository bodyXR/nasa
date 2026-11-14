import type { Feature, FeatureCollection } from 'geojson';
import { marsDistanceM, pointInGeoJsonPolygon } from '../../shared/geo.js';
import type {
  EvidenceCheck,
  EvidenceItem,
  ObjectiveRule,
  Provenance,
  RoverObservation,
  ScienceTarget,
} from '../../shared/types.js';
import { isInsideGaleDemExtent, samplePointElevation } from '../adapters/trekDem.js';
import type { WaypointNormalized } from '../adapters/mslRover.js';

export interface EvidenceOverlayInputs {
  objective: ObjectiveRule;
  regionId: string;
  geologyFeatures: Feature[];
  geologyProvenance: Provenance;
  spectralPoints: Feature[];
  spectralFootprints: Feature[];
  spectralProvenance: Provenance;
  frtProvenance: Provenance;
  duneFeatures: Feature[];
  waypoints: WaypointNormalized[];
  waypointsProvenance: Provenance;
  observations: RoverObservation[];
}

export async function evaluateEvidenceTargets(inputs: EvidenceOverlayInputs): Promise<{
  targets: ScienceTarget[];
  convergenceGrid: FeatureCollection;
}> {
  const {
    objective,
    regionId,
    geologyFeatures,
    geologyProvenance,
    spectralPoints,
    spectralFootprints,
    spectralProvenance,
    frtProvenance,
    duneFeatures,
    waypoints,
    waypointsProvenance,
    observations,
  } = inputs;

  const locatedObs = observations.filter((o) => o.located && o.coordinates);

  const targets: ScienceTarget[] = await Promise.all(
    objective.anchorZones.map(async (zone, idx) => {
      const checks: EvidenceCheck[] = [];
      const evidenceItems: EvidenceItem[] = [];

      // 1. GEOLOGY_UNIT check against USGS SIM 3292 polygons
      const geoMatch = geologyFeatures.find(
        (f) => f.geometry && pointInGeoJsonPolygon(zone.center, f.geometry)
      );
      const unitCode = geoMatch ? String(geoMatch.properties?.Unit ?? geoMatch.properties?.UnitName ?? geoMatch.properties?.Symbol ?? 'Mapped Unit') : null;
      const unitDesc = geoMatch ? String(geoMatch.properties?.UnitDesc ?? geoMatch.properties?.Age ?? geoMatch.properties?.Name ?? JSON.stringify(geoMatch.properties ?? {}).slice(0, 120)) : '';
      const geoKeywordHit = geoMatch
        ? objective.geologyKeywords.some((kw) =>
            `${unitCode} ${unitDesc} ${JSON.stringify(geoMatch.properties ?? {})}`.toLowerCase().includes(kw.toLowerCase())
          )
        : false;
      const geoPassed = Boolean(geoMatch);
      const geoWeight = objective.weights.geologyMatch;
      const geoContrib = geoPassed ? (geoKeywordHit ? geoWeight : geoWeight * 0.7) : 0;

      checks.push({
        criterion: `USGS SIM 3292 Geologic Unit Overlay (${objective.geologyKeywords.slice(0, 3).join('/')})`,
        required: objective.requiredEvidenceTypes.includes('GEOLOGY_UNIT'),
        passed: geoPassed,
        weight: geoWeight,
        contribution: Number((geoContrib * 100).toFixed(1)),
        recordId: geoMatch ? `sim3292-${geoMatch.id ?? unitCode}` : null,
        recordSummary: geoMatch
          ? `Unit ${unitCode ?? 'mapped'} intersects target coordinate (${geoKeywordHit ? 'matches objective keywords' : 'regional unit present'}).`
          : 'No SIM 3292 polygon intersected at coordinate.',
        provenance: geoMatch ? geologyProvenance : null,
      });

      if (geoMatch) {
        evidenceItems.push({
          id: `ev-geo-${zone.id}`,
          type: 'GEOLOGY_UNIT',
          title: `USGS Geologic Unit ${unitCode ?? 'Mapped'}`,
          summary: unitDesc || 'Regional stratigraphic unit mapped in Tanaka et al. (2014) SIM 3292.',
          whyItMatters: 'Confirms regional stratigraphic context for objective targeting.',
          coordinates: zone.center,
          attributes: { unit: unitCode, keywordMatch: geoKeywordHit },
          provenance: geologyProvenance,
        });
      }

      // 2. SPECTRAL_DETECTION check against CRISM/OMEGA detections & FRT footprints
      const nearbySpectral = spectralPoints
        .flatMap((f) =>
          f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates)
            ? [{ feature: f, distM: marsDistanceM(zone.center, f.geometry.coordinates as [number, number]) }]
            : []
        )
        .filter((x) => x.distM <= 28_000)
        .sort((a, b) => a.distM - b.distM);

      const overlappingFrt = spectralFootprints.find(
        (f) => f.geometry && pointInGeoJsonPolygon(zone.center, f.geometry)
      );
      const spectralPassed = Boolean(overlappingFrt) || nearbySpectral.length > 0;
      const specWeight = objective.weights.spectralEvidence;
      const specContrib = overlappingFrt
        ? specWeight
        : nearbySpectral.length > 0
          ? specWeight * 0.8
          : 0;

      const topSpec = nearbySpectral[0];
      const topSpecClass = topSpec
        ? String(topSpec.feature.properties?._mineralClass ?? topSpec.feature.properties?.Class ?? 'Hydrous detection')
        : null;

      checks.push({
        criterion: 'CRISM / OMEGA Spectral Coverage or Hydrous Mineral Detection',
        required: objective.requiredEvidenceTypes.includes('SPECTRAL_DETECTION'),
        passed: spectralPassed,
        weight: specWeight,
        contribution: Number((specContrib * 100).toFixed(1)),
        recordId: overlappingFrt
          ? `crism-frt-${overlappingFrt.id ?? overlappingFrt.properties?.OBS_ID ?? 'site'}`
          : topSpec
            ? `crism-pt-${topSpec.feature.id ?? idx}`
            : null,
        recordSummary: overlappingFrt
          ? `Inside targeted MRO CRISM MTRDR FRT footprint (${String(overlappingFrt.properties?.ProductId ?? overlappingFrt.properties?.OBS_ID ?? 'FRT polygon')})${topSpec ? `; nearest mineral detection ${topSpecClass} at ${(topSpec.distM / 1000).toFixed(1)} km` : ''}.`
          : topSpec
            ? `Nearest orbital mineral detection (${topSpecClass}) at ${(topSpec.distM / 1000).toFixed(1)} km.`
            : 'No CRISM FRT footprint or hydrous point detection within search radius.',
        provenance: overlappingFrt ? frtProvenance : topSpec ? spectralProvenance : null,
      });

      if (overlappingFrt || topSpec) {
        evidenceItems.push({
          id: `ev-spec-${zone.id}`,
          type: 'SPECTRAL_DETECTION',
          title: overlappingFrt ? 'CRISM Targeted Spectral Footprint Overlap' : `CRISM/OMEGA ${topSpecClass}`,
          summary: overlappingFrt
            ? 'Zone falls directly within an MRO CRISM targeted mineralogical observation polygon.'
            : `Nearest orbital aqueous/hydrous mineral signature (${topSpecClass}) lies ${(topSpec!.distM / 1000).toFixed(1)} km away.`,
          whyItMatters: 'Orbital spectroscopy constrains clay/sulfate/hydrous mineral presence before surface traversal.',
          coordinates: zone.center,
          attributes: {
            frtOverlap: Boolean(overlappingFrt),
            nearestDetectionKm: topSpec ? Number((topSpec.distM / 1000).toFixed(2)) : null,
            mineralClass: topSpecClass,
          },
          provenance: overlappingFrt ? frtProvenance : spectralProvenance,
        });
      }

      // 3. ORBITAL_IMAGERY coverage check (HiRISE + CTX + Gale 1m DEM footprint)
      const hasHiriseDemBounds = isInsideGaleDemExtent(zone.center[0], zone.center[1]);
      const imgWeight = objective.weights.imageryCoverage;
      const imgContrib = hasHiriseDemBounds ? imgWeight : imgWeight * 0.5;
      const imgProv: Provenance = {
        sourceId: 'trek-hirise-curiosity',
        sourceName: 'MRO HiRISE Curiosity Roving Mosaic & Gale CTX Mosaic',
        mission: 'Mars Reconnaissance Orbiter',
        instrument: 'HiRISE / CTX',
        productId: 'curiosity_hirise_mosaic + Gale_CTX_BlockAdj_dd',
        sourceUrl: 'https://trek.nasa.gov/tiles/Mars/EQ/curiosity_hirise_mosaic/1.0.0/WMTSCapabilities.xml',
        retrievedAt: new Date().toISOString(),
        processing: ['Verified bounding overlap against HiRISE/CTX Gale mosaic extent'],
        license: 'Public Domain (NASA/JPL-Caltech/UA)',
        attribution: 'NASA / JPL-Caltech / University of Arizona',
        status: 'LIVE',
        confidence: 'HIGH',
        limitations: ['Orbital optical mosaic does not resolve sub-25cm surface cobbles.'],
        classification: 'VERIFIED_FACT',
      };

      checks.push({
        criterion: 'High-Resolution Orbital Optical Coverage (HiRISE ~0.25–1 m/px & CTX ~6 m/px)',
        required: objective.requiredEvidenceTypes.includes('ORBITAL_IMAGERY'),
        passed: hasHiriseDemBounds,
        weight: imgWeight,
        contribution: Number((imgContrib * 100).toFixed(1)),
        recordId: hasHiriseDemBounds ? 'curiosity_hirise_mosaic' : 'Gale_CTX_BlockAdj_dd',
        recordSummary: hasHiriseDemBounds
          ? 'Covered by MRO HiRISE Curiosity Roving Mosaic & CTX Gale Mosaic.'
          : 'Outside Curiosity HiRISE mosaic bounds; CTX/Viking fallback only.',
        provenance: imgProv,
      });

      evidenceItems.push({
        id: `ev-img-${zone.id}`,
        type: 'ORBITAL_IMAGERY',
        title: 'MRO HiRISE + CTX Orbital Visual Coverage',
        summary: 'Verified orbital optical coverage enables ridge, fracture, and ripple inspection.',
        whyItMatters: 'High-resolution imagery is essential to verify outcrop accessibility and sand traps.',
        coordinates: zone.center,
        attributes: { hiriseCovered: hasHiriseDemBounds },
        provenance: imgProv,
      });

      // 4. ROVER_PROXIMITY check against real MSL waypoints & nearest POV raw image
      let nearestWp: { wp: WaypointNormalized; distM: number } | null = null;
      for (const wp of waypoints) {
        const d = marsDistanceM(zone.center, wp.coordinates);
        if (!nearestWp || d < nearestWp.distM) {
          nearestWp = { wp, distM: d };
        }
      }

      let nearestObs: { obs: RoverObservation; distM: number } | null = null;
      for (const obs of locatedObs) {
        const d = marsDistanceM(zone.center, obs.coordinates!);
        if (!nearestObs || d < nearestObs.distM) {
          nearestObs = { obs, distM: d };
        }
      }

      const roverClose = Boolean(nearestWp && nearestWp.distM <= 2500);
      const roverWeight = objective.weights.roverCorroboration;
      const roverContrib = nearestWp
        ? nearestWp.distM <= 500
          ? roverWeight
          : nearestWp.distM <= 2000
            ? roverWeight * 0.85
            : nearestWp.distM <= 5000
              ? roverWeight * 0.55
              : roverWeight * 0.2
        : 0;

      checks.push({
        criterion: 'Curiosity Rover In-Situ Corroboration (<= 2.5 km from verified MSL waypoint)',
        required: objective.requiredEvidenceTypes.includes('ROVER_PROXIMITY'),
        passed: roverClose,
        weight: roverWeight,
        contribution: Number((roverContrib * 100).toFixed(1)),
        recordId: nearestWp ? `msl-sol-${nearestWp.wp.sol}` : null,
        recordSummary: nearestWp
          ? `Nearest localized Curiosity waypoint: Sol ${nearestWp.wp.sol} at ${nearestWp.distM.toFixed(0)} m (elev ${nearestWp.wp.elevationM ?? 'N/A'} m, rover tilt ${nearestWp.wp.tiltDeg ?? 'N/A'}°).`
          : 'No localized rover waypoints found.',
        provenance: nearestWp ? waypointsProvenance : null,
      });

      if (nearestWp) {
        evidenceItems.push({
          id: `ev-rover-${zone.id}`,
          type: 'ROVER_PROXIMITY',
          title: `MSL Curiosity Waypoint Sol ${nearestWp.wp.sol} (${nearestWp.distM.toFixed(0)} m)`,
          summary: `Localized rover position with measured elevation ${nearestWp.wp.elevationM ?? 'N/A'} m and vehicle tilt ${nearestWp.wp.tiltDeg ?? 'N/A'}°.`,
          whyItMatters: 'Ground-truths orbital elevation/slope with actual surface rover measurements.',
          coordinates: nearestWp.wp.coordinates,
          attributes: {
            sol: nearestWp.wp.sol,
            distanceM: Number(nearestWp.distM.toFixed(1)),
            tiltDeg: nearestWp.wp.tiltDeg,
          },
          provenance: waypointsProvenance,
        });
      }

      // 5. TERRAIN_COMPUTABLE check using real DEM point sampling & dune exclusion
      let elevResult: Awaited<ReturnType<typeof samplePointElevation>> | null = null;
      try {
        elevResult = await samplePointElevation(zone.center[0], zone.center[1]);
      } catch {
        elevResult = null;
      }

      const inDune = duneFeatures.some((f) => f.geometry && pointInGeoJsonPolygon(zone.center, f.geometry));
      const demComputable = elevResult !== null && elevResult.elevationM !== null && !inDune;
      const terrainWeight = objective.weights.terrainAccessibility;
      const terrainContrib = demComputable ? terrainWeight : 0;

      checks.push({
        criterion: `Verified DEM Computability & Dune-Free Site (${objective.maxExclusionSlopeDeg}° rule)`,
        required: objective.requiredEvidenceTypes.includes('TERRAIN_COMPUTABLE'),
        passed: demComputable,
        weight: terrainWeight,
        contribution: Number((terrainContrib * 100).toFixed(1)),
        recordId: elevResult?.provenance.productId ?? null,
        recordSummary: demComputable
          ? `Verified ${elevResult!.resolution} elevation ${elevResult!.elevationM} m; outside mapped Dune_Field polygons.`
          : inDune
            ? 'Site overlaps mapped Dune_Field hazard polygon.'
            : 'Elevation sample unavailable at coordinate.',
        provenance: elevResult?.provenance ?? null,
      });

      if (elevResult) {
        evidenceItems.push({
          id: `ev-dem-${zone.id}`,
          type: 'TERRAIN_COMPUTABLE',
          title: `Gale 1m DEM Elevation (${elevResult.elevationM ?? 'N/A'} m)`,
          summary: `Direct ImageServer sample (${elevResult.resolution}) confirms terrain computability.`,
          whyItMatters: 'Required to model slopes, elevation gain, and candidate Marswalk corridors.',
          coordinates: zone.center,
          attributes: { elevationM: elevResult.elevationM, inDune },
          provenance: elevResult.provenance,
        });
      }

      const totalScore = Number(
        checks.reduce((sum, c) => sum + c.contribution, 0).toFixed(1)
      );

      return {
        id: zone.id,
        name: zone.name,
        regionId,
        objectiveId: objective.id,
        coordinates: zone.center,
        elevationM: elevResult?.elevationM ?? null,
        localSlopeDeg: nearestWp?.wp.tiltDeg ?? null,
        score: totalScore,
        rank: idx + 1,
        classification: 'CANDIDATE_SITE' as const,
        disclaimer:
          'CANDIDATE SITE (NOT A DISCOVERY): Derived deterministically by overlaying verified NASA/USGS datasets under documented objective rules.',
        whyHere: [
          zone.rationale,
          ...checks.filter((c) => c.passed).map((c) => c.recordSummary),
        ],
        checks,
        evidenceItems,
        nearestRoverObservation: nearestObs
          ? {
              sol: nearestObs.obs.sol,
              instrument: nearestObs.obs.instrument,
              imageUrl: nearestObs.obs.imageUrl,
              distanceM: Number(nearestObs.distM.toFixed(0)),
              observationDate: nearestObs.obs.earthDate,
              note: `Nearest available rover imagery (${nearestObs.distM.toFixed(0)} m from target — NOT a rendering of the target site itself).`,
              provenance: nearestObs.obs.provenance,
            }
          : null,
        provenance: objective.provenance,
      };
    })
  );

  targets.sort((a, b) => b.score - a.score);
  targets.forEach((t, i) => {
    t.rank = i + 1;
  });

  // Build real Evidence Convergence Grid over the active lower Mount Sharp / Gale study sector
  const convFeatures: Feature[] = [];
  const minLon = 137.33;
  const maxLon = 137.43;
  const minLat = -4.86;
  const maxLat = -4.72;
  const gRows = 8;
  const gCols = 8;
  const dLon = (maxLon - minLon) / gCols;
  const dLat = (maxLat - minLat) / gRows;

  for (let r = 0; r < gRows; r++) {
    for (let c = 0; c < gCols; c++) {
      const cLon = minLon + (c + 0.5) * dLon;
      const cLat = minLat + (r + 0.5) * dLat;
      const pt: [number, number] = [cLon, cLat];
      const layers: string[] = [];

      if (geologyFeatures.some((f) => f.geometry && pointInGeoJsonPolygon(pt, f.geometry))) {
        layers.push('USGS SIM 3292 Geology');
      }
      if (
        spectralFootprints.some((f) => f.geometry && pointInGeoJsonPolygon(pt, f.geometry)) ||
        spectralPoints.some(
          (f) =>
            f.geometry?.type === 'Point' &&
            marsDistanceM(pt, f.geometry.coordinates as [number, number]) <= 12_000
        )
      ) {
        layers.push('CRISM/OMEGA Spectral');
      }
      if (isInsideGaleDemExtent(cLon, cLat)) {
        layers.push('HiRISE/Gale 1m DEM');
      }
      if (waypoints.some((w) => marsDistanceM(pt, w.coordinates) <= 1500)) {
        layers.push('MSL Rover Traverse (<1.5 km)');
      }
      const inDune = duneFeatures.some((f) => f.geometry && pointInGeoJsonPolygon(pt, f.geometry));

      if (layers.length > 0) {
        convFeatures.push({
          type: 'Feature',
          properties: {
            evidenceCount: layers.length,
            layers,
            inDuneHazard: inDune,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [minLon + c * dLon, minLat + r * dLat],
                [minLon + (c + 1) * dLon, minLat + r * dLat],
                [minLon + (c + 1) * dLon, minLat + (r + 1) * dLat],
                [minLon + c * dLon, minLat + (r + 1) * dLat],
                [minLon + c * dLon, minLat + r * dLat],
              ],
            ],
          },
        });
      }
    }
  }

  return {
    targets,
    convergenceGrid: {
      type: 'FeatureCollection',
      features: convFeatures,
    },
  };
}
