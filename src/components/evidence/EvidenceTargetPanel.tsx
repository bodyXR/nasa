import React, { useState } from 'react';
import type { ObjectiveRule, ScienceTarget } from '../../../shared/types';
import { usePlanetStore } from '../../store/planetStore';
import { useFirebase } from '../auth/FirebaseProvider';
import { formatMarsCoord } from '../../../shared/geo';
import {
  CalmEmptyState,
  MetadataAccordion,
  MetricDisplay,
  ScienceLoadingState,
  VerifiedImage,
} from '../ui/InstrumentPrimitives';
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Compass,
  ExternalLink,
  Navigation,
  Table2,
  XCircle,
} from 'lucide-react';

interface EvidenceTargetPanelProps {
  objectives: ObjectiveRule[];
  activeObjective: ObjectiveRule | null;
  targets: ScienceTarget[];
  loading: boolean;
  onPlanWalkToTarget: (target: ScienceTarget) => void;
}

export const EvidenceTargetPanel: React.FC<EvidenceTargetPanelProps> = ({
  objectives,
  activeObjective,
  targets,
  loading,
  onPlanWalkToTarget,
}) => {
  const {
    regionId,
    objectiveId,
    selectedTargetId,
    simpleAdvanced,
    setObjective,
    selectTarget,
    setCamera,
    activateLayer,
  } = usePlanetStore();

  const { user, targetBookmarks, saveTargetBookmark, deleteTargetBookmark, signInWithGoogle } =
    useFirebase();
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [noteDraft, setNoteDraft] = useState('');
  const [bookmarkSaving, setBookmarkSaving] = useState(false);

  const selectedTarget = targets.find((t) => t.id === selectedTargetId) ?? targets[0] ?? null;
  const activeBookmark = selectedTarget
    ? targetBookmarks.find((b) => b.targetId === selectedTarget.id) ?? null
    : null;

  const handleSeeEvidence = (t: ScienceTarget) => {
    selectTarget(t.id);
    activateLayer('trek-crism-spectral');
    activateLayer('usgs-sim3292-geo');
    activateLayer('trek-hirise-curiosity');
    setCamera({ lon: t.coordinates[0], lat: t.coordinates[1], zoom: 14.0 });
  };

  return (
    <div className="space-y-4">
      {/* Scientific Objective Selector */}
      <div className="mp-surface-recessed p-3 space-y-2">
        <div className="text-[10px] font-telemetry tracking-wider text-[#D4B483]">
          Scientific objective
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          {objectives.map((obj) => {
            const active = obj.id === objectiveId;
            return (
              <button
                key={obj.id}
                type="button"
                onClick={() => setObjective(obj.id)}
                className={`text-left p-2.5 transition-colors cursor-pointer ${
                  active
                    ? 'mp-surface-raised border-[#C44D2B]'
                    : 'mp-instrument-panel hover:border-[#373D4B]'
                }`}
              >
                <div className="text-xs font-medium text-[#F7F3EB]">{obj.title}</div>
                <div className="text-[11px] text-[#9D968A] mt-0.5">{obj.subtitle}</div>
              </button>
            );
          })}
        </div>

        {activeObjective && (
          <MetadataAccordion label="Scoring weights & criteria" defaultOpen={simpleAdvanced === 'ADVANCED'}>
            <p className="text-xs text-[#EAE4D9] leading-relaxed">{activeObjective.scientificGoal}</p>
            <div className="font-telemetry text-[10px] text-[#9D968A] grid grid-cols-2 gap-1 pt-1">
              <span>Geology: {Math.round(activeObjective.weights.geologyMatch * 100)}%</span>
              <span>Spectral: {Math.round(activeObjective.weights.spectralEvidence * 100)}%</span>
              <span>Imagery: {Math.round(activeObjective.weights.imageryCoverage * 100)}%</span>
              <span>Rover proximity: {Math.round(activeObjective.weights.roverCorroboration * 100)}%</span>
              <span>Terrain access: {Math.round(activeObjective.weights.terrainAccessibility * 100)}%</span>
              <span>Max slope cap: {activeObjective.maxExclusionSlopeDeg}°</span>
            </div>
          </MetadataAccordion>
        )}
      </div>

      {/* Candidate Targets Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-[#EAE4D9]">
          Candidate destinations ({targets.length})
        </div>
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'CARDS' ? 'TABLE' : 'CARDS')}
          className="mp-btn-secondary min-h-[30px] px-2.5 text-[10px] font-telemetry text-[#D4B483] flex items-center gap-1 cursor-pointer"
        >
          <Table2 className="w-3 h-3" />
          <span>{viewMode === 'CARDS' ? 'Table' : 'Cards'}</span>
        </button>
      </div>

      {loading && (
        <ScienceLoadingState
          title="EVALUATING CONVERGENCE"
          subtitle="Cross-referencing USGS geology, CRISM spectra, and 1m DEM slope."
        />
      )}

      {!loading && targets.length === 0 && (
        <CalmEmptyState
          title="No candidate destinations available"
          suggestion="Upstream planetary datasets did not return matching targets for this objective."
        />
      )}

      {viewMode === 'TABLE' ? (
        <div className="overflow-x-auto mp-surface-recessed">
          <table className="w-full text-left text-[11px] font-telemetry">
            <thead className="border-b border-[#242832] text-[#9D968A] bg-[#111317]">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">Site</th>
                <th className="p-2">Score</th>
                <th className="p-2">Elev</th>
                <th className="p-2">Slope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#242832]">
              {targets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => selectTarget(t.id)}
                  className={`cursor-pointer ${
                    t.id === selectedTarget?.id ? 'bg-[#171A20] text-[#F7F3EB]' : 'text-[#CEC8BC] hover:bg-[#111317]'
                  }`}
                >
                  <td className="p-2">#{t.rank}</td>
                  <td className="p-2 font-sans font-medium">{t.name}</td>
                  <td className="p-2 text-[#D98A4E]">{t.score}/100</td>
                  <td className="p-2">{t.elevationM !== null ? `${t.elevationM.toFixed(1)} m` : 'N/A'}</td>
                  <td className="p-2">{t.localSlopeDeg !== null ? `${t.localSlopeDeg.toFixed(1)}°` : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2.5">
          {targets.map((t) => {
            const isSel = t.id === selectedTarget?.id;
            return (
              <div
                key={t.id}
                className={`p-3 transition-colors ${
                  isSel
                    ? 'mp-surface-raised mp-reticle-frame border-[#C44D2B]'
                    : 'mp-surface-recessed hover:border-[#373D4B]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectTarget(t.id)}
                  className="w-full text-left cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] font-telemetry text-[#D98A4E]">
                    <span>Rank #{t.rank} · Candidate site</span>
                    <span className="tabular-nums">{t.score} / 100</span>
                  </div>
                  <div className="text-sm font-medium text-[#F7F3EB] mt-0.5">{t.name}</div>
                  {/* Calibrated horizontal convergence meter */}
                  <div className="mt-2 h-1 bg-[#07080A] border border-[#242832] overflow-hidden">
                    <div
                      className="h-full bg-[#D98A4E] transition-all duration-300"
                      style={{ width: `${Math.max(4, Math.min(100, t.score))}%` }}
                    />
                  </div>
                  <div className="text-[11px] font-telemetry text-[#9D968A] mt-1.5">
                    {formatMarsCoord(t.coordinates[0], t.coordinates[1], 4)}
                  </div>
                </button>

                {isSel && (
                  <div className="mt-3 pt-3 border-t border-[#242832] space-y-3 mp-settle-in">
                    <div className="grid grid-cols-2 gap-2">
                      <MetricDisplay
                        label="Elevation"
                        value={t.elevationM !== null ? t.elevationM.toFixed(1) : 'N/A'}
                        unit={t.elevationM !== null ? 'm' : undefined}
                      />
                      <MetricDisplay
                        label="Local slope"
                        value={t.localSlopeDeg !== null ? t.localSlopeDeg.toFixed(1) : 'N/A'}
                        unit={t.localSlopeDeg !== null ? '°' : undefined}
                        accent="ochre"
                      />
                    </div>

                    <div>
                      <div className="text-[10px] font-telemetry tracking-wider text-[#D4B483] mb-1">
                        Why this target
                      </div>
                      <ul className="space-y-1 text-xs text-[#EAE4D9]">
                        {t.whyHere.map((line, i) => (
                          <li key={i} className="leading-snug">• {line}</li>
                        ))}
                      </ul>
                    </div>

                    {t.nearestRoverObservation && (
                      <div className="mp-instrument-panel p-2.5 space-y-1.5">
                        <div className="text-[10px] font-telemetry text-[#D4B483]">
                          Nearest Curiosity observation ({t.nearestRoverObservation.distanceM.toFixed(0)} m away)
                        </div>
                        <VerifiedImage
                          src={t.nearestRoverObservation.imageUrl}
                          alt={`Curiosity Sol ${t.nearestRoverObservation.sol} ${t.nearestRoverObservation.instrument} near ${t.name}`}
                          className="w-full h-32 object-cover border border-[#242832]"
                        />
                        <div className="text-[10px] font-telemetry text-[#9D968A]">
                          Sol {t.nearestRoverObservation.sol} · {t.nearestRoverObservation.instrument} ·{' '}
                          {t.nearestRoverObservation.observationDate}
                        </div>
                      </div>
                    )}

                    <MetadataAccordion
                      label={`Evidence checks (${t.checks.filter((c) => c.passed).length}/${t.checks.length} passed)`}
                      defaultOpen={simpleAdvanced === 'ADVANCED'}
                    >
                      <div className="space-y-1.5">
                        {t.checks.map((chk, idx) => (
                          <div
                            key={idx}
                            className="mp-instrument-panel p-2 text-[11px]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 font-medium text-[#EAE4D9]">
                                {chk.passed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5E9C76] shrink-0" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-[#C44D2B] shrink-0" />
                                )}
                                <span>{chk.criterion}</span>
                              </span>
                              <span className="font-telemetry text-[10px] text-[#D4B483] tabular-nums">
                                +{chk.contribution}/{chk.weight}
                              </span>
                            </div>
                            <div className="text-[#9D968A] mt-1">{chk.recordSummary}</div>
                            {chk.provenance && (
                              <div className="mt-1 flex items-center justify-between text-[10px] font-telemetry text-[#736D63]">
                                <span>{chk.provenance.sourceName}</span>
                                <a
                                  href={chk.provenance.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#D4B483] inline-flex items-center gap-0.5 underline"
                                >
                                  Source <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            )}
                          </div>
                        ))}
                        <p className="text-[10px] text-[#736D63] leading-snug pt-1">{t.disclaimer}</p>
                      </div>
                    </MetadataAccordion>

                    <div className="mp-instrument-panel p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-telemetry tracking-wider text-[#D4B483]">
                          CLOUD TARGET BOOKMARK &amp; FIELD NOTE
                        </span>
                        {activeBookmark && (
                          <button
                            type="button"
                            onClick={() => void deleteTargetBookmark(activeBookmark.id)}
                            className="text-[10px] font-telemetry text-[#C44D2B] underline cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      {user ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            maxLength={240}
                            value={noteDraft || activeBookmark?.note || ''}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="Add observation or sample rationale note…"
                            className="w-full bg-[#07080A] border border-[#242832] px-2.5 py-1.5 text-xs text-[#EAE4D9] outline-none focus:border-[#D4B483]"
                          />
                          <button
                            type="button"
                            disabled={bookmarkSaving}
                            onClick={async () => {
                              setBookmarkSaving(true);
                              try {
                                await saveTargetBookmark({
                                  targetId: t.id,
                                  targetName: t.name,
                                  regionId,
                                  objectiveId,
                                  note: noteDraft || activeBookmark?.note || '',
                                });
                                setNoteDraft('');
                              } finally {
                                setBookmarkSaving(false);
                              }
                            }}
                            className="mp-btn-secondary min-h-[30px] px-2.5 text-[11px] inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {activeBookmark ? (
                              <BookmarkCheck className="w-3.5 h-3.5 text-[#5E9C76]" />
                            ) : (
                              <Bookmark className="w-3.5 h-3.5 text-[#D4B483]" />
                            )}
                            <span>
                              {bookmarkSaving
                                ? 'Saving…'
                                : activeBookmark
                                  ? 'Update Bookmark & Note'
                                  : 'Save Target Bookmark'}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void signInWithGoogle()}
                          className="text-[11px] font-telemetry text-[#D4B483] underline cursor-pointer"
                        >
                          Sign in with Google to bookmark targets &amp; field notes
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSeeEvidence(t)}
                        className="mp-btn-secondary min-h-[38px] flex-1 px-3 py-1.5 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Compass className="w-3.5 h-3.5 text-[#5B8BB4]" />
                        <span>Inspect layers</span>
                      </button>
                      <button
                        type="button"
                        data-tour="plan-walk-btn"
                        onClick={() => onPlanWalkToTarget(t)}
                        className="mp-btn-primary min-h-[38px] flex-1 px-3 py-1.5 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Plan Marswalk</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
