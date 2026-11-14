import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  Crosshair,
  ExternalLink,
  Globe2,
  Layers,
  Loader2,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { usePlanetStore } from '../../store/planetStore';
import {
  isGmpQuotaError,
  useEarthAutocompleteSuggestions,
} from './useEarthAutocompleteSuggestions';

interface AnalogQueryPreset {
  id: string;
  label: string;
  query: string;
  marsParallel: string;
  objectiveHint: string;
}

// Query-only field site presets: all coordinates, names, and metadata are fetched live from Places API (New)
const ANALOG_PRESETS: AnalogQueryPreset[] = [
  {
    id: 'mdrs-utah',
    label: 'Mars Desert Research Station',
    query: 'Mars Desert Research Station Hanksville Utah',
    marsParallel: 'Mount Sharp clay & sulfate mudstone badlands',
    objectiveHint: 'ancient-water',
  },
  {
    id: 'craters-moon',
    label: 'Craters of the Moon',
    query: 'Craters of the Moon National Monument Idaho',
    marsParallel: 'Basaltic regolith & volcanic EVA terrain hazards',
    objectiveHint: 'boxwork-formations',
  },
  {
    id: 'atacama-chile',
    label: 'Atacama Desert',
    query: 'Atacama Desert Chile',
    marsParallel: 'Hyperarid sulfate evaporites & astrobiology crusts',
    objectiveHint: 'ancient-water',
  },
  {
    id: 'jpl-pasadena',
    label: 'NASA JPL Mars Yard',
    query: 'Jet Propulsion Laboratory Pasadena California',
    marsParallel: 'Curiosity & Perseverance rover mobility testbed',
    objectiveHint: 'ancient-water',
  },
  {
    id: 'timanfaya-lanzarote',
    label: 'Timanfaya / Lanzarote',
    query: 'Timanfaya National Park Lanzarote Spain',
    marsParallel: 'ESA PANGAEA basaltic crater & astronaut training',
    objectiveHint: 'boxwork-formations',
  },
  {
    id: 'riotinto-spain',
    label: 'Minas de Riotinto',
    query: 'Minas de Riotinto Spain',
    marsParallel: 'Ferric iron-oxide & acidic sulfate mineralizations',
    objectiveHint: 'ancient-water',
  },
];

type EarthMapTypeId = 'satellite' | 'hybrid' | 'terrain' | 'roadmap';
type TravelModeOption = 'DRIVING' | 'WALKING';

interface ResolvedPlaceMarker {
  id: string;
  name: string;
  address: string;
  location: google.maps.LatLngLiteral;
  rating?: number | null;
  userRatingCount?: number | null;
  kind: 'SEARCH' | 'ANALOG' | 'NEARBY';
  marsParallel?: string;
}

interface ComputedRouteSummary {
  distanceMeters: number;
  durationMillis: number;
  travelMode: TravelModeOption;
  warnings: string[];
}

function resolveEnvApiKey(): string {
  const viteKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
  const directKey = (import.meta.env.GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
  const globalKey =
    (globalThis as typeof globalThis & { GOOGLE_MAPS_API_KEY?: string }).GOOGLE_MAPS_API_KEY ?? '';
  return (viteKey || directKey || globalKey).trim();
}

function formatDuration(ms: number): string {
  const totalMins = Math.round(ms / 60000);
  if (totalMins < 60) return `${totalMins} min`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

const PlaceMarkerWithInfoWindow: React.FC<{
  item: ResolvedPlaceMarker;
  isSelected: boolean;
  onSelect: (item: ResolvedPlaceMarker) => void;
  onSetOrigin: (item: ResolvedPlaceMarker) => void;
  onSetDestination: (item: ResolvedPlaceMarker) => void;
  onCloseInfo: () => void;
}> = ({ item, isSelected, onSelect, onSetOrigin, onSetDestination, onCloseInfo }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  const pinBg =
    item.kind === 'ANALOG' ? '#C44D2B' : item.kind === 'NEARBY' ? '#5B8BB4' : '#D4B483';
  const pinBorder = isSelected ? '#F7F3EB' : '#07080A';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={item.location}
        title={item.name}
        onClick={() => onSelect(item)}
      >
        <Pin
          background={pinBg}
          borderColor={pinBorder}
          glyphColor="#07080A"
          scale={isSelected ? 1.2 : 1}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={270} onCloseClick={onCloseInfo}>
          <div className="bg-[#0B0D10] text-[#EAE4D9] p-1 space-y-1.5 font-sans">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#D4B483]">
              {item.kind === 'ANALOG'
                ? 'Mars Analog Field Site'
                : item.kind === 'NEARBY'
                ? 'Nearby Field Feature'
                : 'Searched Location'}
            </div>
            <div className="text-xs font-semibold text-[#F7F3EB] leading-snug">{item.name}</div>
            {item.address && (
              <div className="text-[11px] text-[#9D968A] leading-snug">{item.address}</div>
            )}
            {item.marsParallel && (
              <div className="text-[11px] text-[#D98A4E] leading-snug border-t border-[#242832] pt-1">
                Mars parallel: {item.marsParallel}
              </div>
            )}
            <div className="text-[10px] font-mono text-[#736D63]">
              {item.location.lat.toFixed(4)}°, {item.location.lng.toFixed(4)}°
              {item.rating != null ? ` · ★ ${item.rating.toFixed(1)}` : ''}
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onSetOrigin(item)}
                className="px-2 py-1 text-[10px] font-mono bg-[#171A20] border border-[#5E9C76] text-[#5E9C76] hover:bg-[#5E9C76]/15 cursor-pointer"
              >
                Set Origin A
              </button>
              <button
                type="button"
                onClick={() => onSetDestination(item)}
                className="px-2 py-1 text-[10px] font-mono bg-[#171A20] border border-[#C44D2B] text-[#C44D2B] hover:bg-[#C44D2B]/15 cursor-pointer"
              >
                Set Target B
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const EarthAnalogInner: React.FC = () => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const coreLib = useMapsLibrary('core');
  const apiStatus = useApiLoadingStatus();

  const {
    objectiveId,
    earthAnalogQuery,
    setEarthAnalogQuery,
    setMode,
    setInspectorContext,
    setRightRailOpen,
  } = usePlanetStore();

  const [mapTypeId, setMapTypeId] = useState<EarthMapTypeId>('hybrid');
  const [searchInput, setSearchInput] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const [markers, setMarkers] = useState<ResolvedPlaceMarker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const [routeOrigin, setRouteOrigin] = useState<{
    label: string;
    location: google.maps.LatLngLiteral;
  } | null>(null);
  const [routeDestination, setRouteDestination] = useState<{
    label: string;
    location: google.maps.LatLngLiteral;
  } | null>(null);
  const [pickingPoint, setPickingPoint] = useState<'A' | 'B' | null>(null);
  const [travelMode, setTravelMode] = useState<TravelModeOption>('DRIVING');

  const [routeSummary, setRouteSummary] = useState<ComputedRouteSummary | null>(null);
  const [computingRoute, setComputingRoute] = useState(false);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  const {
    suggestions,
    isLoading: autocompleteLoading,
    error: autocompleteError,
    resetSession,
  } = useEarthAutocompleteSuggestions(searchInput);

  const selectedMarker = markers.find((m) => m.id === selectedMarkerId) ?? null;

  const clearPolylines = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearPolylines();
    };
  }, [clearPolylines]);

  // Monitor API load errors cleanly
  useEffect(() => {
    if (apiStatus === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [apiStatus]);

  const handleSelectAutocomplete = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;

      setSearchingPlaces(true);
      setStatusNotice(null);
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'viewport',
            'rating',
            'userRatingCount',
          ],
        });

        if (place.location) {
          const loc = { lat: place.location.lat(), lng: place.location.lng() };
          const item: ResolvedPlaceMarker = {
            id: place.id || `place-${Date.now()}`,
            name: place.displayName || suggestion.placePrediction.text.text,
            address: place.formattedAddress || '',
            location: loc,
            rating: place.rating ?? null,
            userRatingCount: place.userRatingCount ?? null,
            kind: 'SEARCH',
          };

          setMarkers((prev) => {
            const filtered = prev.filter((m) => m.id !== item.id);
            return [item, ...filtered];
          });
          setSelectedMarkerId(item.id);

          if (map) {
            if (place.viewport) {
              map.fitBounds(place.viewport);
            } else {
              map.panTo(loc);
              map.setZoom(13);
            }
          }
        }
        setSearchInput('');
        setSearchFocused(false);
        resetSession();
      } catch (err) {
        if (isGmpQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setStatusNotice(
          err instanceof Error ? err.message : 'Unable to fetch selected place details.'
        );
      } finally {
        setSearchingPlaces(false);
      }
    },
    [placesLib, map, resetSession]
  );

  const runAnalogPresetSearch = useCallback(
    async (preset: AnalogQueryPreset) => {
      if (!placesLib) {
        setStatusNotice('Places library is still initializing…');
        return;
      }

      setActivePresetId(preset.id);
      setSearchingPlaces(true);
      setStatusNotice(null);

      try {
        const { Place } = placesLib;
        const { places } = await Place.searchByText({
          textQuery: preset.query,
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'viewport',
            'rating',
            'userRatingCount',
          ],
          maxResultCount: 3,
          language: 'en',
          region: 'US',
        });

        if (!places || places.length === 0) {
          setStatusNotice(`No Google Places match returned for "${preset.label}".`);
          return;
        }

        const primary = places[0];
        if (!primary.location) {
          setStatusNotice(`"${preset.label}" returned no coordinates.`);
          return;
        }

        const mapped: ResolvedPlaceMarker[] = places
          .filter((p) => p.location)
          .map((p, idx) => ({
            id: p.id || `${preset.id}-${idx}`,
            name: p.displayName || preset.label,
            address: p.formattedAddress || '',
            location: { lat: p.location!.lat(), lng: p.location!.lng() },
            rating: p.rating ?? null,
            userRatingCount: p.userRatingCount ?? null,
            kind: 'ANALOG',
            marsParallel: idx === 0 ? preset.marsParallel : undefined,
          }));

        setMarkers(mapped);
        setSelectedMarkerId(mapped[0]?.id ?? null);

        if (map && mapped[0]) {
          if (primary.viewport) {
            map.fitBounds(primary.viewport);
          } else {
            map.panTo(mapped[0].location);
            map.setZoom(12);
          }
        }
      } catch (err) {
        if (isGmpQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setStatusNotice(
          err instanceof Error
            ? err.message
            : 'Unable to load analog field site from Google Places.'
        );
      } finally {
        setSearchingPlaces(false);
      }
    },
    [placesLib, map]
  );

  // If jumped into Earth Analog with a pre-requested preset query from Mars inspector
  useEffect(() => {
    if (!earthAnalogQuery || !placesLib) return;
    const match = ANALOG_PRESETS.find((p) => p.id === earthAnalogQuery || p.query === earthAnalogQuery);
    setEarthAnalogQuery(null);
    if (match) {
      void runAnalogPresetSearch(match);
    }
  }, [earthAnalogQuery, placesLib, setEarthAnalogQuery, runAnalogPresetSearch]);

  const handleFindNearbySupport = useCallback(async () => {
    if (!placesLib || !selectedMarker) return;
    setSearchingPlaces(true);
    setStatusNotice(null);
    try {
      const { Place } = placesLib;
      const { places } = await Place.searchNearby({
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount'],
        locationRestriction: {
          center: selectedMarker.location,
          radius: 30000,
        },
        includedPrimaryTypes: ['national_park', 'park', 'campground', 'tourist_attraction'],
        maxResultCount: 6,
        language: 'en',
      });

      if (!places || places.length === 0) {
        setStatusNotice('No nearby parks or field bases returned within 30 km.');
        return;
      }

      const nearbyMapped: ResolvedPlaceMarker[] = places
        .filter((p) => p.location)
        .map((p, idx) => ({
          id: p.id || `nearby-${idx}`,
          name: p.displayName || 'Nearby Field Feature',
          address: p.formattedAddress || '',
          location: { lat: p.location!.lat(), lng: p.location!.lng() },
          rating: p.rating ?? null,
          userRatingCount: p.userRatingCount ?? null,
          kind: 'NEARBY',
        }));

      setMarkers((prev) => {
        const base = prev.filter((m) => m.kind !== 'NEARBY');
        const seen: Record<string, boolean> = {};
        base.forEach((b) => {
          seen[b.id] = true;
        });
        return [...base, ...nearbyMapped.filter((n) => !seen[n.id])];
      });

      if (map && coreLib) {
        const bounds = new coreLib.LatLngBounds();
        bounds.extend(selectedMarker.location);
        nearbyMapped.forEach((n) => bounds.extend(n.location));
        map.fitBounds(bounds);
      }
    } catch (err) {
      if (isGmpQuotaError(err)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setStatusNotice(
        err instanceof Error ? err.message : 'Unable to search nearby field features.'
      );
    } finally {
      setSearchingPlaces(false);
    }
  }, [placesLib, selectedMarker, map, coreLib]);

  const handleComputeRoute = useCallback(async () => {
    if (!routesLib || !map || !routeOrigin || !routeDestination) return;
    setComputingRoute(true);
    setStatusNotice(null);
    clearPolylines();
    setRouteSummary(null);

    const request: google.maps.routes.ComputeRoutesRequest = {
      origin: routeOrigin.location,
      destination: routeDestination.location,
      travelMode: travelMode as google.maps.TravelModeString,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'warnings'],
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    };

    try {
      const response = await routesLib.Route.computeRoutes(request);
      const primary = response.routes?.[0];
      if (!primary) {
        setStatusNotice(
          `No ${travelMode.toLowerCase()} route returned between Origin A and Target B.`
        );
        return;
      }

      const newPolylines = primary.createPolylines();
      newPolylines.forEach((poly) => {
        poly.setOptions({
          strokeColor: '#D4B483',
          strokeOpacity: 0.95,
          strokeWeight: 4.5,
        });
        poly.setMap(map);
      });
      polylinesRef.current = newPolylines;

      if (primary.viewport) {
        map.fitBounds(primary.viewport);
      }

      setRouteSummary({
        distanceMeters: primary.distanceMeters ?? 0,
        durationMillis: primary.durationMillis ?? 0,
        travelMode,
        warnings: primary.warnings ?? [],
      });
    } catch (err) {
      if (isGmpQuotaError(err)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setStatusNotice(
        err instanceof Error
          ? err.message
          : 'Unable to load route data. Please check your network or API quota.'
      );
    } finally {
      setComputingRoute(false);
    }
  }, [routesLib, map, routeOrigin, routeDestination, travelMode, clearPolylines]);

  const handleMapClick = useCallback(
    (ev: { detail: { latLng: google.maps.LatLngLiteral | null } }) => {
      const latLng = ev.detail.latLng;
      if (!latLng || !pickingPoint) return;

      const label = `${latLng.lat.toFixed(4)}°, ${latLng.lng.toFixed(4)}°`;
      if (pickingPoint === 'A') {
        setRouteOrigin({ label: `Point A (${label})`, location: latLng });
        setPickingPoint('B');
      } else {
        setRouteDestination({ label: `Point B (${label})`, location: latLng });
        setPickingPoint(null);
      }
    },
    [pickingPoint]
  );

  const handleClearRoute = useCallback(() => {
    clearPolylines();
    setRouteSummary(null);
    setRouteOrigin(null);
    setRouteDestination(null);
    setPickingPoint(null);
  }, [clearPolylines]);

  const inspectorBody = (
    <div className="p-3.5 space-y-4">
      <div className="mp-surface-recessed mp-reticle-frame p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-telemetry tracking-wider text-[#D4B483] uppercase">
            Earth Analog Workbench
          </span>
          <button
            type="button"
            onClick={() => {
              setMode('FIELD');
              setInspectorContext('ROUTE');
              setRightRailOpen(true);
            }}
            className="text-[10px] font-telemetry text-[#9D968A] hover:text-[#F7F3EB] underline cursor-pointer"
          >
            Return to Mars Atlas
          </button>
        </div>
        <h2 className="font-editorial text-base font-medium text-[#F7F3EB] leading-snug">
          Terrestrial Mars Analog Sites
        </h2>
        <p className="text-xs text-[#9D968A] leading-relaxed">
          Select an analog study site below to query live coordinates from Google Places API (New),
          or search any terrestrial field location.
        </p>
      </div>

      {statusNotice && (
        <div className="mp-surface-recessed border-[#D98A4E] p-2.5 text-xs text-[#D98A4E]">
          {statusNotice}
        </div>
      )}

      {/* Curated Mars-Analog Query Presets */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-telemetry tracking-wider text-[#D4B483] uppercase">
            Study Site Analog Presets
          </span>
          {searchingPlaces && (
            <span className="inline-flex items-center gap-1 text-[10px] font-telemetry text-[#9D968A]">
              <Loader2 className="w-3 h-3 animate-spin" /> Querying…
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {ANALOG_PRESETS.map((preset) => {
            const active = activePresetId === preset.id;
            const matchesObjective = preset.objectiveHint === objectiveId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => void runAnalogPresetSearch(preset)}
                className={`w-full text-left p-2.5 border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#171A20] border-[#D4B483]'
                    : 'bg-[#0B0D10] border-[#242832] hover:border-[#373D4B]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#F7F3EB]">{preset.label}</span>
                  {matchesObjective && (
                    <span className="text-[9px] font-telemetry text-[#5E9C76] border border-[#5E9C76]/50 px-1 py-0.5">
                      OBJ MATCH
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#9D968A] mt-0.5">{preset.marsParallel}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Active Place Details Card */}
      {selectedMarker && (
        <section className="mp-surface-recessed p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-telemetry tracking-wider text-[#D4B483] uppercase">
              Selected Terrestrial Place
            </span>
            <span className="text-[10px] font-telemetry text-[#736D63]">
              {selectedMarker.location.lat.toFixed(4)}°, {selectedMarker.location.lng.toFixed(4)}°
            </span>
          </div>
          <div className="text-xs font-semibold text-[#F7F3EB]">{selectedMarker.name}</div>
          {selectedMarker.address && (
            <div className="text-[11px] text-[#9D968A]">{selectedMarker.address}</div>
          )}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() =>
                setRouteOrigin({
                  label: selectedMarker.name,
                  location: selectedMarker.location,
                })
              }
              className="mp-btn-secondary min-h-[32px] px-2 text-[11px] text-[#5E9C76] border-[#5E9C76]/60 cursor-pointer"
            >
              Set Origin (A)
            </button>
            <button
              type="button"
              onClick={() =>
                setRouteDestination({
                  label: selectedMarker.name,
                  location: selectedMarker.location,
                })
              }
              className="mp-btn-secondary min-h-[32px] px-2 text-[11px] text-[#C44D2B] border-[#C44D2B]/60 cursor-pointer"
            >
              Set Target (B)
            </button>
          </div>
          <button
            type="button"
            disabled={searchingPlaces}
            onClick={() => void handleFindNearbySupport()}
            className="mp-btn-secondary w-full min-h-[34px] px-2.5 text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#5B8BB4]" />
            <span>Find Nearby Parks &amp; Field Camps (30 km)</span>
          </button>
        </section>
      )}

      {/* Terrestrial Field Traverse Planner (Routes API) */}
      <section className="mp-surface-recessed p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#EAE4D9]">
            <RouteIcon className="w-3.5 h-3.5 text-[#D4B483]" />
            <span>Terrestrial Traverse (Routes API)</span>
          </div>
          {(routeOrigin || routeDestination || routeSummary) && (
            <button
              type="button"
              onClick={handleClearRoute}
              className="text-[10px] font-telemetry text-[#9D968A] hover:text-[#F7F3EB] inline-flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between gap-2 bg-[#0B0D10] border border-[#242832] px-2.5 py-1.5">
            <span className="font-telemetry text-[#5E9C76]">A</span>
            <span className="flex-1 truncate text-[#EAE4D9]">
              {routeOrigin ? routeOrigin.label : 'Pick on map or select place'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 bg-[#0B0D10] border border-[#242832] px-2.5 py-1.5">
            <span className="font-telemetry text-[#C44D2B]">B</span>
            <span className="flex-1 truncate text-[#EAE4D9]">
              {routeDestination ? routeDestination.label : 'Pick on map or select place'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickingPoint(pickingPoint ? null : 'A')}
            className={`flex-1 min-h-[34px] px-2 text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
              pickingPoint
                ? 'mp-btn-primary'
                : 'mp-btn-secondary'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>
              {pickingPoint === 'A'
                ? 'Click Map for A…'
                : pickingPoint === 'B'
                ? 'Click Map for B…'
                : 'Pick A → B on Map'}
            </span>
          </button>

          <div className="mp-segmented text-[10px] font-telemetry shrink-0">
            {(['DRIVING', 'WALKING'] as TravelModeOption[]).map((tm) => (
              <button
                key={tm}
                type="button"
                onClick={() => setTravelMode(tm)}
                className={`mp-segmented-btn min-h-[32px] px-2 cursor-pointer ${
                  travelMode === tm
                    ? 'bg-[#171A20] text-[#D4B483]'
                    : 'text-[#736D63] hover:text-[#EAE4D9]'
                }`}
              >
                {tm === 'DRIVING' ? 'DRIVE' : 'WALK'}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={!routeOrigin || !routeDestination || computingRoute}
          onClick={() => void handleComputeRoute()}
          className="mp-btn-primary w-full min-h-[36px] px-3 text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-45 cursor-pointer"
        >
          {computingRoute ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Computing Route…</span>
            </>
          ) : (
            <>
              <Navigation className="w-3.5 h-3.5" />
              <span>Compute Terrestrial Route</span>
            </>
          )}
        </button>

        {routeSummary && (
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#242832]">
            <div className="bg-[#0B0D10] border border-[#242832] p-2">
              <div className="text-[9px] font-telemetry text-[#736D63] uppercase">Distance</div>
              <div className="text-sm font-telemetry font-medium text-[#F7F3EB]">
                {(routeSummary.distanceMeters / 1000).toFixed(2)} km
              </div>
            </div>
            <div className="bg-[#0B0D10] border border-[#242832] p-2">
              <div className="text-[9px] font-telemetry text-[#736D63] uppercase">
                Est. {routeSummary.travelMode.toLowerCase()}
              </div>
              <div className="text-sm font-telemetry font-medium text-[#D4B483]">
                {formatDuration(routeSummary.durationMillis)}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="text-[10px] font-telemetry text-[#736D63] leading-relaxed border-t border-[#242832] pt-2.5">
        Earth imagery, Places, and Routes powered by Google Maps Platform.{' '}
        <a
          href="https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#D4B483] underline inline-flex items-center gap-0.5"
        >
          Terms <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );

  return (
    <div className="w-full h-full flex relative overflow-hidden bg-[#07080A]">
      {/* Central Full-Bleed Google Map Canvas */}
      <div className="flex-1 relative min-w-0 h-full overflow-hidden">
        {/* Explicit height container per CF2 */}
        <div className="w-full h-full">
          <GoogleMap
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            defaultCenter={{ lat: 38.4065, lng: -110.7919 }}
            defaultZoom={5}
            mapTypeId={mapTypeId}
            gestureHandling="greedy"
            disableDefaultUI={false}
            streetViewControl={true}
            mapTypeControl={false}
            fullscreenControl={false}
            onClick={handleMapClick}
            style={{ width: '100%', height: '100%' }}
          >
            {markers.map((item) => (
              <PlaceMarkerWithInfoWindow
                key={item.id}
                item={item}
                isSelected={item.id === selectedMarkerId}
                onSelect={(m) => setSelectedMarkerId(m.id)}
                onSetOrigin={(m) =>
                  setRouteOrigin({ label: m.name, location: m.location })
                }
                onSetDestination={(m) =>
                  setRouteDestination({ label: m.name, location: m.location })
                }
                onCloseInfo={() => setSelectedMarkerId(null)}
              />
            ))}

            {routeOrigin && (
              <AdvancedMarker position={routeOrigin.location} title={`Origin A: ${routeOrigin.label}`}>
                <Pin background="#5E9C76" borderColor="#07080A" glyphColor="#F7F3EB" glyphText="A" />
              </AdvancedMarker>
            )}

            {routeDestination && (
              <AdvancedMarker
                position={routeDestination.location}
                title={`Target B: ${routeDestination.label}`}
              >
                <Pin background="#C44D2B" borderColor="#07080A" glyphColor="#F7F3EB" glyphText="B" />
              </AdvancedMarker>
            )}
          </GoogleMap>
        </div>

        {/* Floating Top Control Overlay (Search + Map Type Switcher) */}
        <div className="absolute top-3 left-3 right-3 lg:right-auto lg:max-w-[540px] z-10 flex flex-col gap-2 pointer-events-none">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {/* Autocomplete Search Box */}
            <div className="relative flex-1 min-w-[230px] mp-instrument-panel">
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <Search className="w-3.5 h-3.5 text-[#D4B483] shrink-0" />
                <input
                  type="text"
                  value={searchInput}
                  onFocus={() => setSearchFocused(true)}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search Earth analog sites, parks, or landmarks…"
                  aria-label="Search Earth analog locations via Google Places"
                  className="w-full bg-transparent text-xs text-[#F7F3EB] placeholder:text-[#736D63] outline-none"
                />
                {autocompleteLoading && (
                  <Loader2 className="w-3.5 h-3.5 text-[#D4B483] animate-spin shrink-0" />
                )}
                {searchInput && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchInput('');
                      resetSession();
                    }}
                    className="text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {searchFocused && (suggestions.length > 0 || autocompleteError) && (
                <div className="absolute left-0 right-0 top-full mt-1 mp-instrument-panel bg-[#0B0D10] max-h-64 overflow-y-auto mp-scroll z-30">
                  {autocompleteError && (
                    <div className="px-3 py-2 text-[11px] text-[#D98A4E]">
                      {autocompleteError}
                    </div>
                  )}
                  {suggestions.map((sug, idx) => (
                    <button
                      key={sug.placePrediction?.placeId ?? idx}
                      type="button"
                      onClick={() => void handleSelectAutocomplete(sug)}
                      className="w-full text-left px-3 py-2 border-b border-[#242832] last:border-b-0 hover:bg-[#171A20] flex items-start gap-2 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-[#D4B483] shrink-0 mt-0.5" />
                      <span className="text-xs text-[#EAE4D9] leading-snug">
                        {sug.placePrediction?.text.text}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Map Type Switcher */}
            <div className="mp-instrument-panel p-0.5 flex items-center gap-0.5 text-[10px] font-telemetry">
              {(
                [
                  { id: 'satellite', label: 'SAT' },
                  { id: 'hybrid', label: 'HYB' },
                  { id: 'terrain', label: 'TER' },
                  { id: 'roadmap', label: 'MAP' },
                ] as const
              ).map((mt) => (
                <button
                  key={mt.id}
                  type="button"
                  onClick={() => setMapTypeId(mt.id)}
                  className={`px-2 py-1.5 cursor-pointer ${
                    mapTypeId === mt.id
                      ? 'bg-[#171A20] text-[#D4B483]'
                      : 'text-[#9D968A] hover:text-[#F7F3EB]'
                  }`}
                >
                  {mt.label}
                </button>
              ))}
            </div>
          </div>

          {pickingPoint && (
            <div className="pointer-events-auto mp-instrument-panel border-[#D4B483] px-3 py-1.5 text-[11px] font-telemetry text-[#D4B483] flex items-center justify-between gap-3">
              <span>
                Click on Google Map to set terrestrial {pickingPoint === 'A' ? 'Origin (A)' : 'Target (B)'}
              </span>
              <button
                type="button"
                onClick={() => setPickingPoint(null)}
                className="text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Mobile Inspector Toggle */}
        <button
          type="button"
          onClick={() => setMobileInspectorOpen(!mobileInspectorOpen)}
          className="lg:hidden absolute bottom-4 left-3 z-20 mp-btn-primary min-h-[38px] px-3.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{mobileInspectorOpen ? 'Hide Earth Tools' : 'Analog Sites & Route'}</span>
        </button>

        {mobileInspectorOpen && (
          <div className="lg:hidden absolute inset-x-0 bottom-14 max-h-[55vh] z-20 bg-[#111317] border-t border-[#242832] overflow-y-auto mp-scroll">
            {inspectorBody}
          </div>
        )}
      </div>

      {/* Desktop Right Inspector */}
      <aside
        aria-label="Earth Analog Field Inspector"
        className="hidden lg:block w-[360px] xl:w-[376px] h-full shrink-0 bg-[#111317] border-l border-[#242832] overflow-y-auto mp-scroll z-20"
      >
        {inspectorBody}
      </aside>
    </div>
  );
};

export const EarthAnalogWorkbench: React.FC = () => {
  const { setMode } = usePlanetStore();
  const [apiKey, setApiKey] = useState<string>(() => resolveEnvApiKey());
  const [resolvingKey, setResolvingKey] = useState<boolean>(() => !resolveEnvApiKey());

  useEffect(() => {
    if (apiKey) {
      setResolvingKey(false);
      return;
    }
    let cancelled = false;
    fetch('/api/config/maps')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { apiKey?: string } | null) => {
        if (!cancelled && data?.apiKey) {
          setApiKey(data.apiKey);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResolvingKey(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  if (resolvingKey) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#07080A] text-xs font-telemetry text-[#D4B483] gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Initializing Google Maps Earth Analog Workbench…</span>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#07080A] p-6">
        <div className="max-w-md mp-instrument-panel mp-reticle-frame p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-telemetry text-[#D4B483]">
            <Globe2 className="w-4 h-4" />
            <span>EARTH ANALOG WORKBENCH</span>
          </div>
          <h2 className="font-editorial text-lg text-[#F7F3EB]">
            Google Maps API Key Not Configured
          </h2>
          <p className="text-xs text-[#9D968A] leading-relaxed">
            Set <code className="font-telemetry text-[#EAE4D9]">VITE_GOOGLE_MAPS_API_KEY</code> in
            your environment or enable Google Maps in AI Studio settings to explore Earth analog
            field sites and terrestrial traverse routes.
          </p>
          <button
            type="button"
            onClick={() => setMode('FIELD')}
            className="mp-btn-secondary min-h-[36px] px-3 text-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Return to Mars Atlas</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={['places', 'routes', 'marker']}
      language="en"
      region="US"
    >
      <EarthAnalogInner />
    </APIProvider>
  );
};
