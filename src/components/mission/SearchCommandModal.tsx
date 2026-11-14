import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import { usePlanetStore } from '../../store/planetStore';
import { Compass, Search, X } from 'lucide-react';

type SearchResultItem = Awaited<ReturnType<typeof apiClient.search>>['results'][number];

interface ToolSearchItem {
  id: string;
  kind: 'TOOL';
  title: string;
  subtitle: string;
  provenanceNote: string;
  keywords: string[];
  execute: () => void;
}

const QUICK_JUMPS = [
  {
    label: 'Gale Crater Center',
    coord: '4.775°S 137.389°E',
    lon: 137.3889,
    lat: -4.775,
    zoom: 12.2,
  },
  {
    label: 'Lower Mount Sharp Boxwork',
    coord: '4.826°S 137.389°E',
    lon: 137.3889,
    lat: -4.826,
    zoom: 13.8,
  },
  {
    label: 'Glen Torridon Clay Trough',
    coord: '4.750°S 137.372°E',
    lon: 137.372,
    lat: -4.7495,
    zoom: 14.0,
  },
  {
    label: 'Vera Rubin Ridge Crest',
    coord: '4.741°S 137.377°E',
    lon: 137.3765,
    lat: -4.7412,
    zoom: 14.0,
  },
];

function mapKindToGroup(kind: string): 'PLACES' | 'TARGETS' | 'DATASETS' | 'COORDINATES' {
  const k = kind.toUpperCase();
  if (k.includes('COORD')) return 'COORDINATES';
  if (k.includes('TARGET') || k.includes('OBJECTIVE')) return 'TARGETS';
  if (k.includes('DATASET')) return 'DATASETS';
  return 'PLACES';
}

const GROUP_ORDER = ['TOOLS', 'PLACES', 'TARGETS', 'DATASETS', 'COORDINATES'] as const;

export const SearchCommandModal: React.FC = () => {
  const {
    searchModalOpen,
    setSearchModalOpen,
    setCamera,
    setMode,
    activateLayer,
    selectDataset,
    setObjective,
    setActiveTab,
    setActiveTool,
    enterRoutePlanningMode,
    startTour,
  } = usePlanetStore();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const availableTools: ToolSearchItem[] = useMemo(
    () => [
      {
        id: 'tool-route',
        kind: 'TOOL',
        title: 'Plan a route (A → B)',
        subtitle: 'Place start and destination on Mars to analyze candidate traverses',
        provenanceNote: 'Tool',
        keywords: ['route', 'plan', 'marswalk', 'traverse', 'point a', 'point b', 'walk', 'path', 'routing'],
        execute: () => {
          setMode('FIELD');
          enterRoutePlanningMode(true);
        },
      },
      {
        id: 'tool-dist',
        kind: 'TOOL',
        title: 'Measure distance',
        subtitle: 'Direct geodesic distance and azimuth bearing between points',
        provenanceNote: 'Tool',
        keywords: ['measure', 'distance', 'ruler', 'range', 'span'],
        execute: () => {
          setMode('FIELD');
          setActiveTool('MEASURE_DIST');
        },
      },
      {
        id: 'tool-path',
        kind: 'TOOL',
        title: 'Measure path',
        subtitle: 'Multi-waypoint traverse distance with DEM elevation sampling',
        provenanceNote: 'Tool',
        keywords: ['path', 'polygon', 'traverse length', 'multi-point'],
        execute: () => {
          setMode('FIELD');
          setActiveTool('MEASURE_PATH');
        },
      },
      {
        id: 'tool-probe',
        kind: 'TOOL',
        title: 'Inspect coordinate',
        subtitle: 'Query live 1m DEM elevation, slope, and dataset coverage',
        provenanceNote: 'Tool',
        keywords: ['inspect', 'probe', 'elevation', 'slope', 'dem', 'height', 'altitude'],
        execute: () => {
          setMode('FIELD');
          setActiveTool('INSPECT_COORD');
        },
      },
      {
        id: 'tool-profile',
        kind: 'TOOL',
        title: 'Elevation profile',
        subtitle: 'Scrub cross-section terrain relief and slope grades',
        provenanceNote: 'Tool',
        keywords: ['profile', 'cross-section', 'elevation profile', 'relief', 'chart'],
        execute: () => {
          setMode('FIELD');
          setActiveTool('PROFILE');
        },
      },
      {
        id: 'tool-compare',
        kind: 'TOOL',
        title: 'Split layer compare',
        subtitle: 'Interactive swipe comparison between two Mars datasets',
        provenanceNote: 'Tool',
        keywords: ['compare', 'split', 'swipe', 'diff', 'layer compare'],
        execute: () => {
          setMode('FIELD');
          setActiveTool('COMPARE');
        },
      },
      {
        id: 'tool-tour',
        kind: 'TOOL',
        title: 'Mission training tour',
        subtitle: 'Interactive 12-step guided mission training of MARS//PATH',
        provenanceNote: 'Guide',
        keywords: ['tour', 'guide', 'walkthrough', 'help', 'tutorial', 'training', 'learn'],
        execute: () => {
          setMode('FIELD');
          startTour(0);
        },
      },
    ],
    [enterRoutePlanningMode, setActiveTool, setMode, startTour]
  );

  const matchedTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return availableTools.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.includes(q))
    );
  }, [availableTools, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen(!searchModalOpen);
      } else if (e.key === 'Escape' && searchModalOpen) {
        setSearchModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchModalOpen, setSearchModalOpen]);

  useEffect(() => {
    if (searchModalOpen) {
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [searchModalOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiClient.search(trimmed);
        setResults(res.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const grouped = useMemo(() => {
    const buckets: {
      TOOLS: ToolSearchItem[];
      PLACES: SearchResultItem[];
      TARGETS: SearchResultItem[];
      DATASETS: SearchResultItem[];
      COORDINATES: SearchResultItem[];
    } = {
      TOOLS: matchedTools,
      PLACES: [],
      TARGETS: [],
      DATASETS: [],
      COORDINATES: [],
    };
    for (const r of results) {
      buckets[mapKindToGroup(r.kind)].push(r);
    }
    return buckets;
  }, [results, matchedTools]);

  // Flat, visually-ordered list of selectable entries for ↑/↓/Enter keyboard navigation
  type SelectableEntry =
    | { type: 'jump'; index: number }
    | { type: 'tool'; item: ToolSearchItem }
    | { type: 'result'; item: SearchResultItem };

  const selectableItems = useMemo<SelectableEntry[]>(() => {
    if (!query.trim()) {
      return QUICK_JUMPS.map((_, index) => ({ type: 'jump' as const, index }));
    }
    const items: SelectableEntry[] = [];
    for (const t of grouped.TOOLS) {
      items.push({ type: 'tool', item: t });
    }
    for (const groupName of ['PLACES', 'TARGETS', 'DATASETS', 'COORDINATES'] as const) {
      for (const r of grouped[groupName]) {
        items.push({ type: 'result', item: r });
      }
    }
    return items;
  }, [query, grouped]);

  const resultFlatIndex = useMemo(() => {
    const map = new Map<SearchResultItem | ToolSearchItem, number>();
    selectableItems.forEach((entry, idx) => {
      if (entry.type === 'result') map.set(entry.item, idx);
      if (entry.type === 'tool') map.set(entry.item, idx);
    });
    return map;
  }, [selectableItems]);

  // A new query restarts keyboard selection from the first row
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // Keep the highlighted row valid as the result list changes
  useEffect(() => {
    setSelectedIdx((i) => Math.min(i, Math.max(0, selectableItems.length - 1)));
  }, [selectableItems.length]);

  // Keep the highlighted row visible inside the scrollable result list
  useEffect(() => {
    if (!searchModalOpen || selectableItems.length === 0) return;
    document
      .querySelector(`[data-search-idx="${selectedIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, selectableItems.length, searchModalOpen]);

  if (!searchModalOpen) return null;

  const handleSelect = (item: SearchResultItem) => {
    setMode('FIELD');
    if (item.datasetId) {
      activateLayer(item.datasetId);
      selectDataset(item.datasetId);
    }
    if (item.objectiveId) {
      setObjective(item.objectiveId);
      setActiveTab('EVIDENCE');
    }
    if (item.coordinates) {
      setCamera({
        lon: item.coordinates[0],
        lat: item.coordinates[1],
        zoom: item.kind === 'REGION' ? 12.2 : 14.2,
      });
    }
    setSearchModalOpen(false);
    setQuery('');
  };

  const runEntry = (entry: SelectableEntry) => {
    if (entry.type === 'jump') {
      const j = QUICK_JUMPS[entry.index];
      setMode('FIELD');
      setCamera({ lon: j.lon, lat: j.lat, zoom: j.zoom });
      setSearchModalOpen(false);
      setQuery('');
      return;
    }
    if (entry.type === 'tool') {
      entry.item.execute();
      setSearchModalOpen(false);
      setQuery('');
      return;
    }
    handleSelect(entry.item);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search Mars places, targets, datasets, and coordinates"
      onClick={() => setSearchModalOpen(false)}
      className="fixed inset-0 z-50 bg-[#07080A]/80 flex items-start justify-center pt-[12vh] px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl mp-instrument-panel mp-reticle-frame overflow-hidden mp-settle-in"
      >
        <div className="flex items-center border-b border-[#242832] bg-[#0B0D10] px-3.5 py-2.5 gap-2.5">
          <Search className="w-4 h-4 text-[#D4B483] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="mars-search-listbox"
            aria-activedescendant={
              selectableItems.length > 0 ? `search-opt-${selectedIdx}` : undefined
            }
            aria-label="Search Mars places, targets, datasets, or coordinates"
            placeholder="Jump to IAU landmark, dataset, target, or Mars coordinate (e.g. -4.826 137.389)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (selectableItems.length === 0) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIdx((i) => (i + 1) % selectableItems.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIdx((i) => (i - 1 + selectableItems.length) % selectableItems.length);
              } else if (e.key === 'Home') {
                e.preventDefault();
                setSelectedIdx(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                setSelectedIdx(selectableItems.length - 1);
              } else if (e.key === 'Enter') {
                const entry = selectableItems[selectedIdx];
                if (entry) {
                  e.preventDefault();
                  runEntry(entry);
                }
              }
            }}
            className="w-full bg-transparent text-sm text-[#F7F3EB] placeholder:text-[#736D63] outline-none"
          />
          <button
            type="button"
            aria-label="Close search palette"
            onClick={() => setSearchModalOpen(false)}
            className="text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          id="mars-search-listbox"
          role="listbox"
          aria-label="Search results"
          className="max-h-96 overflow-y-auto mp-scroll"
        >
          {!query.trim() && (
            <div className="p-3.5 space-y-2.5">
              <div className="text-[10px] font-telemetry tracking-wider text-[#D4B483]">
                CALIBRATED STUDY CORRIDOR LANDMARKS
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {QUICK_JUMPS.map((j, index) => {
                  const isSel = index === selectedIdx;
                  return (
                    <button
                      key={j.label}
                      type="button"
                      role="option"
                      id={`search-opt-${index}`}
                      data-search-idx={index}
                      aria-selected={isSel}
                      onClick={() => {
                        setMode('FIELD');
                        setCamera({ lon: j.lon, lat: j.lat, zoom: j.zoom });
                        setSearchModalOpen(false);
                      }}
                      onMouseEnter={() => setSelectedIdx(index)}
                      className={`mp-surface-recessed p-2.5 text-left transition-colors cursor-pointer border ${
                        isSel
                          ? 'border-[#D4B483] bg-[#171A20]'
                          : 'border-transparent hover:border-[#D4B483]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[#F7F3EB]">
                        <Compass className="w-3.5 h-3.5 text-[#D98A4E] shrink-0" />
                        <span>{j.label}</span>
                      </div>
                      <div className="text-[10px] font-telemetry text-[#9D968A] mt-1">
                        {j.coord}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] font-telemetry text-[#736D63] text-center">
                ↑ ↓ to move · Enter to jump · Esc to close
              </div>
            </div>
          )}

          {query.trim() && loading && (
            <div className="p-4 text-xs font-telemetry text-[#9D968A]">
              Searching IAU features, targets, and planetary datasets…
            </div>
          )}

          {query.trim() && !loading && results.length === 0 && matchedTools.length === 0 && (
            <div className="p-4 text-xs text-[#9D968A]">
              No matching places, targets, datasets, tools, or Mars coordinates.
            </div>
          )}

          {query.trim() &&
            !loading &&
            GROUP_ORDER.map((groupName) => {
              const items = grouped[groupName];
              if (items.length === 0) return null;
              return (
                <div key={groupName}>
                  <div className="px-3.5 py-1.5 bg-[#0B0D10] border-y border-[#242832] text-[10px] font-telemetry tracking-wider text-[#D4B483]">
                    {groupName}
                  </div>
                  {items.map((r) => {
                    const flatIdx = resultFlatIndex.get(r) ?? 0;
                    const isSel = flatIdx === selectedIdx;
                    return (
                      <button
                        key={`${r.kind}-${r.id}`}
                        type="button"
                        role="option"
                        id={`search-opt-${flatIdx}`}
                        data-search-idx={flatIdx}
                        aria-selected={isSel}
                        onClick={() => {
                          if (r.kind === 'TOOL') {
                            (r as ToolSearchItem).execute();
                            setSearchModalOpen(false);
                            setQuery('');
                          } else {
                            handleSelect(r as SearchResultItem);
                          }
                        }}
                        onMouseEnter={() => setSelectedIdx(flatIdx)}
                        className={`w-full text-left px-3.5 py-2.5 border-b border-[#242832] cursor-pointer transition-colors ${
                          isSel ? 'bg-[#171A20]' : 'hover:bg-[#171A20]'
                        } ${isSel ? 'border-l-2 border-l-[#D4B483]' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[#F7F3EB]">{r.title}</span>
                          <span className="text-[10px] font-telemetry text-[#736D63] truncate max-w-[160px]">
                            {r.provenanceNote}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#9D968A] mt-0.5">{r.subtitle}</div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
