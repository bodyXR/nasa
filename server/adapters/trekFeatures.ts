import { z } from 'zod';
import { fetchCachedJson } from '../httpClient.js';
import type { DataStatus, GazetteerEntry, Provenance } from '../../shared/types.js';
import { normalizeLon180 } from '../../shared/geo.js';

const ARCGIS_BASE = 'https://trek.nasa.gov/mars/trekarcgis/rest/services';

const GeoJsonFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      id: z.union([z.string(), z.number()]).optional(),
      geometry: z.any().nullable(),
      properties: z.record(z.string(), z.any()).nullable().default({}),
    })
  ),
});

export interface NormalizedFeatureCollection {
  collection: GeoJSON.FeatureCollection;
  status: DataStatus;
  retrievedAt: string;
  provenance: Provenance;
}

const TTL_24H = 86_400;

export async function fetchGeologyUnits(bbox: [number, number, number, number]): Promise<NormalizedFeatureCollection> {
  const geomParam = bbox.join(',');
  const url = `${ARCGIS_BASE}/SIM3292_Global_Geology/MapServer/0/query?geometry=${geomParam}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outFields=*&f=geojson`;
  const key = `sim3292:${geomParam}`;
  const res = await fetchCachedJson(key, 'usgs-sim3292-geo', url, TTL_24H, (raw) =>
    GeoJsonFeatureCollectionSchema.parse(raw)
  );
  return {
    collection: res.data as GeoJSON.FeatureCollection,
    status: res.status,
    retrievedAt: res.retrievedAt,
    provenance: {
      sourceId: 'usgs-sim3292-geo',
      sourceName: 'USGS SIM 3292 Geologic Map of Mars',
      mission: 'USGS Astrogeology Science Center',
      instrument: 'Tanaka et al. (2014) Global Geologic Synthesis',
      productId: 'SIM3292_Global_Geology',
      sourceUrl: `${ARCGIS_BASE}/SIM3292_Global_Geology/MapServer`,
      retrievedAt: res.retrievedAt,
      processing: ['ArcGIS MapServer GeoJSON spatial envelope query'],
      license: 'Public Domain (USGS)',
      attribution: 'USGS Astrogeology Science Center (Tanaka et al., 2014, SIM 3292)',
      status: res.status,
      confidence: 'MEDIUM',
      limitations: ['Global 1:20,000,000 scale generalizes local outcrop contacts inside Gale Crater.'],
      classification: 'VERIFIED_FACT',
    },
  };
}

export async function fetchDuneFields(bbox: [number, number, number, number]): Promise<NormalizedFeatureCollection> {
  const geomParam = bbox.join(',');
  const url = `${ARCGIS_BASE}/Dune_Field/MapServer/0/query?geometry=${geomParam}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outFields=*&f=geojson`;
  const key = `dune_field:${geomParam}`;
  const res = await fetchCachedJson(key, 'trek-dune-fields', url, TTL_24H, (raw) =>
    GeoJsonFeatureCollectionSchema.parse(raw)
  );
  return {
    collection: res.data as GeoJSON.FeatureCollection,
    status: res.status,
    retrievedAt: res.retrievedAt,
    provenance: {
      sourceId: 'trek-dune-fields',
      sourceName: 'USGS / Mars Trek Mapped Dune Fields',
      mission: 'Mars Global Digital Dune Database',
      instrument: 'THEMIS / CTX / HiRISE',
      productId: 'Dune_Field',
      sourceUrl: `${ARCGIS_BASE}/Dune_Field/MapServer/0`,
      retrievedAt: res.retrievedAt,
      processing: ['ArcGIS MapServer GeoJSON spatial envelope query'],
      license: 'Public Domain (USGS/NASA)',
      attribution: 'USGS Astrogeology / NASA Mars Trek',
      status: res.status,
      confidence: 'HIGH',
      limitations: ['Isolated sub-grid sand ripples outside mapped dune polygons are not included.'],
      classification: 'VERIFIED_FACT',
    },
  };
}

export async function fetchSpectralDetections(bbox: [number, number, number, number]): Promise<{
  points: NormalizedFeatureCollection;
  frtFootprints: NormalizedFeatureCollection;
}> {
  const geomParam = bbox.join(',');
  const [aqueousRes, hydrousRes, frtRes] = await Promise.all([
    fetchCachedJson(
      `crism_aqueous:${geomParam}`,
      'trek-crism-spectral',
      `${ARCGIS_BASE}/Aquieous_Mineral_Distribution_Options_clon0/MapServer/0/query?geometry=${geomParam}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outFields=*&f=geojson`,
      TTL_24H,
      (raw) => GeoJsonFeatureCollectionSchema.parse(raw)
    ),
    fetchCachedJson(
      `crism_hydrous:${geomParam}`,
      'trek-crism-spectral',
      `${ARCGIS_BASE}/Hydrous_Mineral_Detections_OMEGA_CRISM_clon0/MapServer/0/query?geometry=${geomParam}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outFields=*&f=geojson`,
      TTL_24H,
      (raw) => GeoJsonFeatureCollectionSchema.parse(raw)
    ),
    fetchCachedJson(
      `crism_frt:${geomParam}`,
      'trek-crism-spectral',
      `${ARCGIS_BASE}/mars_mro_crism_mtrdr_c0a_humex_frt_sites/MapServer/0/query?geometry=${geomParam}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outFields=*&f=geojson`,
      TTL_24H,
      (raw) => GeoJsonFeatureCollectionSchema.parse(raw)
    ),
  ]);

  const mergedPoints: GeoJSON.Feature[] = [
    ...aqueousRes.data.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        _dataset: 'CRISM Aqueous Minerals',
        _mineralClass: String(f.properties?.Class ?? f.properties?.Mineral ?? 'Aqueous Mineral'),
      },
    })),
    ...hydrousRes.data.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        _dataset: 'OMEGA/CRISM Hydrous Detections',
        _mineralClass: String(f.properties?.Type ?? f.properties?.Instrument ?? 'Hydrous Mineral'),
      },
    })),
  ];

  const status: DataStatus =
    aqueousRes.status === 'LIVE' || hydrousRes.status === 'LIVE' ? 'LIVE' : 'CACHED';

  return {
    points: {
      collection: { type: 'FeatureCollection', features: mergedPoints },
      status,
      retrievedAt: aqueousRes.retrievedAt,
      provenance: {
        sourceId: 'trek-crism-spectral',
        sourceName: 'MRO CRISM & MEX OMEGA Aqueous/Hydrous Mineral Detections',
        mission: 'MRO / Mars Express',
        instrument: 'CRISM / OMEGA',
        productId: 'Aquieous_Mineral_Distribution + Hydrous_Mineral_Detections',
        sourceUrl: `${ARCGIS_BASE}/Aquieous_Mineral_Distribution_Options_clon0/MapServer/0`,
        retrievedAt: aqueousRes.retrievedAt,
        processing: ['Merged CRISM aqueous & OMEGA/CRISM hydrous spatial queries'],
        license: 'Public Domain (NASA/ESA)',
        attribution: 'NASA / JPL / JHU-APL (CRISM) & ESA / IAS (OMEGA)',
        status,
        confidence: 'HIGH',
        limitations: ['Surface dust can obscure spectral absorption bands.'],
        classification: 'VERIFIED_FACT',
      },
    },
    frtFootprints: {
      collection: frtRes.data as GeoJSON.FeatureCollection,
      status: frtRes.status,
      retrievedAt: frtRes.retrievedAt,
      provenance: {
        sourceId: 'trek-crism-frt-footprints',
        sourceName: 'MRO CRISM MTRDR Targeted FRT Footprints',
        mission: 'Mars Reconnaissance Orbiter',
        instrument: 'CRISM',
        productId: 'mars_mro_crism_mtrdr_c0a_humex_frt_sites',
        sourceUrl: `${ARCGIS_BASE}/mars_mro_crism_mtrdr_c0a_humex_frt_sites/MapServer/0`,
        retrievedAt: frtRes.retrievedAt,
        processing: ['ArcGIS MapServer GeoJSON footprint query'],
        license: 'Public Domain (NASA/JPL/JHU-APL)',
        attribution: 'NASA / JPL / JHU-APL (CRISM MTRDR)',
        status: frtRes.status,
        confidence: 'HIGH',
        limitations: ['Footprints indicate spectral observation coverage, not continuous outcrop mineralogy.'],
        classification: 'VERIFIED_FACT',
      },
    },
  };
}

export async function searchIauNomenclature(queryText: string, bbox?: [number, number, number, number]): Promise<{
  entries: GazetteerEntry[];
  status: DataStatus;
  retrievedAt: string;
}> {
  const safeQ = queryText.trim().replace(/['"]/g, '');
  const whereClause = safeQ
    ? `UPPER(name) LIKE UPPER('%${safeQ}%') OR UPPER(clean_name) LIKE UPPER('%${safeQ}%')`
    : '1=1';
  const geomPart = bbox
    ? `&geometry=${bbox.join(',')}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects`
    : '';
  const url = `${ARCGIS_BASE}/combinedNom/MapServer/0/query?where=${encodeURIComponent(whereClause)}${geomPart}&outFields=*&resultRecordCount=40&f=geojson`;
  const key = `iau_nom:${safeQ}:${bbox ? bbox.join(',') : 'global'}`;

  const res = await fetchCachedJson(key, 'trek-iau-nomenclature', url, TTL_24H, (raw) =>
    GeoJsonFeatureCollectionSchema.parse(raw)
  );

  const entries: GazetteerEntry[] = res.data.features
    .filter((f) => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
    .map((f, idx) => {
      const p = f.properties ?? {};
      const coords = f.geometry.coordinates as [number, number];
      const lon = normalizeLon180(Number(p.center_lon ?? coords[0]));
      const lat = Number(p.center_lat ?? coords[1]);
      return {
        id: `iau-${p.FID ?? idx}`,
        name: String(p.name ?? p.clean_name ?? 'Unnamed IAU Feature'),
        featureType: String(p.type ?? p.feature_type ?? 'IAU Planetary Feature'),
        coordinates: [lon, lat],
        diameterKm: typeof p.diameter === 'number' ? p.diameter : null,
        origin: String(p.origin ?? 'IAU Gazetteer of Planetary Nomenclature'),
        provenance: {
          sourceId: 'trek-iau-nomenclature',
          sourceName: 'IAU Gazetteer of Planetary Nomenclature (Mars Trek combinedNom)',
          mission: 'IAU / USGS Astrogeology',
          instrument: 'Planetary Gazetteer',
          productId: 'combinedNom',
          sourceUrl: `${ARCGIS_BASE}/combinedNom/MapServer/0`,
          retrievedAt: res.retrievedAt,
          processing: ['ArcGIS MapServer Gazetteer query'],
          license: 'Public Domain (IAU/USGS)',
          attribution: 'IAU WGPSN / USGS Astrogeology Science Center',
          status: res.status,
          confidence: 'HIGH',
          limitations: ['Feature center coordinates represent nominal IAU centroids.'],
          classification: 'VERIFIED_FACT',
        },
      };
    });

  return { entries, status: res.status, retrievedAt: res.retrievedAt };
}
