import React, { useEffect, useState } from 'react';
import type { MissionBrief, RouteAnalysisResponse, ScienceTarget } from '../../../shared/types';
import { apiClient } from '../../services/apiClient';
import { usePlanetStore } from '../../store/planetStore';
import { CalmEmptyState, CalmErrorState, ScienceLoadingState } from '../ui/InstrumentPrimitives';
import { Download, Printer, Sparkles, X } from 'lucide-react';

interface MissionBriefModalProps {
  open: boolean;
  onClose: () => void;
  targets: ScienceTarget[];
  routeAnalysis: (RouteAnalysisResponse & { runId?: string }) | null;
}

export const MissionBriefModal: React.FC<MissionBriefModalProps> = ({
  open,
  onClose,
  targets,
  routeAnalysis,
}) => {
  const { regionId, objectiveId, selectedTargetId, selectedRouteId } = usePlanetStore();
  const [brief, setBrief] = useState<MissionBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeAi, setIncludeAi] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);

  const target = targets.find((t) => t.id === selectedTargetId) ?? targets[0] ?? null;
  const route =
    routeAnalysis?.candidates.find((c) => c.id === selectedRouteId) ??
    routeAnalysis?.candidates.find((c) => c.feasible) ??
    routeAnalysis?.candidates[0] ??
    null;

  useEffect(() => {
    if (!open || !target || !route) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .generateBrief({
        regionId,
        objectiveId,
        targetId: target.id,
        routeId: route.id,
        routeAnalysisId: routeAnalysis?.runId,
        includeAiSummary: includeAi,
      })
      .then((res) => {
        if (!cancelled) setBrief(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to build mission brief.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, regionId, objectiveId, target?.id, route?.id, routeAnalysis?.runId, includeAi]);

  if (!open) return null;

  const handleExportJson = () => {
    if (!brief) return;
    const blob = new Blob([JSON.stringify(brief, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brief.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mission Brief Field Plan"
      className="fixed inset-0 z-50 bg-[#07080A]/90 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="mp-instrument-panel mp-reticle-frame max-w-4xl w-full max-h-[90vh] flex flex-col mp-settle-in">
        <div className="p-4 border-b border-[#242832] bg-[#0B0D10] flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            <div className="text-[10px] font-telemetry tracking-wider text-[#D4B483]">
              Reproducible Marswalk Field Plan
            </div>
            <h2 className="font-editorial text-xl text-[#F7F3EB]">Mission Brief &amp; Provenance Record</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="mp-btn-secondary inline-flex items-center gap-2 text-[11px] px-2.5 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAi}
                onChange={(e) => setIncludeAi(e.target.checked)}
                className="mp-checkbox"
              />
              <Sparkles className="w-3 h-3 text-[#D98A4E]" />
              <span>AI synthesis</span>
            </label>

            <button
              type="button"
              onClick={handleExportJson}
              disabled={!brief}
              className="mp-btn-secondary min-h-[36px] px-3 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={!brief}
              className="mp-btn-primary min-h-[36px] px-3 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              aria-label="Close Mission Brief"
              onClick={onClose}
              className="mp-btn-secondary min-h-[36px] px-2.5 text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto mp-scroll p-5 space-y-5 text-xs">
          {!route && (
            <CalmEmptyState
              title="No evaluated route selected"
              suggestion="Run a terrain route evaluation first to assemble a reproducible Marswalk Field Plan."
            />
          )}

          {loading && (
            <ScienceLoadingState
              title="ASSEMBLING FIELD PLAN"
              subtitle="Collecting provenance citations and computing deterministic SHA-256 verification hash."
            />
          )}

          {error && (
            <CalmErrorState
              title="Unable to build Field Plan"
              message="An upstream issue prevented generating the reproducible brief."
              technicalDetails={error}
            />
          )}

          {brief && (
            <div className="space-y-5">
              <div className="mp-surface-recessed mp-reticle-frame p-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="font-telemetry text-[10px] text-[#D98A4E]">
                    Plan ID: {brief.id}
                  </div>
                  <h3 className="font-editorial text-2xl text-[#F7F3EB] mt-1">{brief.title}</h3>
                  <div className="font-telemetry text-[11px] text-[#9D968A] mt-1">
                    {brief.region.name} · {brief.objective.title} · {brief.parameters.crs}
                  </div>
                </div>
                <div className="text-right font-telemetry text-[10px] text-[#736D63]">
                  <div>Generated {brief.generatedAt}</div>
                  <div>SHA-256 {brief.contentHash.slice(0, 24)}…</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="mp-surface-recessed p-3.5 space-y-2">
                  <div className="font-telemetry text-[10px] tracking-wider text-[#D4B483]">
                    Target justification (#{brief.target.rank} · {brief.target.score}/100)
                  </div>
                  <ul className="space-y-1 text-[#EAE4D9]">
                    {brief.whyTarget.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>

                <div className="mp-surface-recessed p-3.5 space-y-2">
                  <div className="font-telemetry text-[10px] tracking-wider text-[#D4B483]">
                    Route evaluation ({brief.route.label})
                  </div>
                  <ul className="space-y-1 text-[#EAE4D9]">
                    {brief.whyRoute.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                  <div className="font-telemetry text-[10px] text-[#9D968A] pt-1 border-t border-[#242832]">
                    DEM: {brief.parameters.demSource} · {brief.parameters.gridCellSizeM} m/cell
                  </div>
                </div>
              </div>

              {brief.aiNarrative && (
                <div className="mp-surface-recessed border-[#D98A4E] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-telemetry text-[10px] tracking-wider text-[#D98A4E]">
                      {brief.aiNarrative.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAiInput(!showAiInput)}
                      className="text-[10px] font-telemetry underline text-[#9D968A] cursor-pointer"
                    >
                      {showAiInput ? 'Hide grounded payload' : 'Inspect input payload'}
                    </button>
                  </div>
                  <p className="text-[#EAE4D9] whitespace-pre-line leading-relaxed">{brief.aiNarrative.text}</p>
                  {showAiInput && (
                    <pre className="text-[10px] font-telemetry bg-[#111317] p-2 overflow-x-auto text-[#9D968A]">
                      {JSON.stringify(brief.aiNarrative.inputPayload, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              <div className="mp-surface-recessed p-3.5 space-y-1.5">
                <div className="font-telemetry text-[10px] tracking-wider text-[#D4B483]">
                  Measured environmental context (Historical archive)
                </div>
                <div className="text-[#CEC8BC]">• {brief.environmentContext.remsSummary}</div>
                <div className="text-[#CEC8BC]">• {brief.environmentContext.radSummary}</div>
              </div>

              <div className="mp-surface-recessed p-3.5 space-y-2">
                <div className="font-telemetry text-[10px] tracking-wider text-[#D4B483]">
                  Authoritative data sources
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[10px] font-telemetry">
                    <thead className="border-b border-[#242832] text-[#736D63]">
                      <tr>
                        <th className="py-1 pr-2">Dataset</th>
                        <th className="py-1 pr-2">Mission / Instrument</th>
                        <th className="py-1 pr-2">Status</th>
                        <th className="py-1">Retrieved</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#242832]">
                      {brief.dataSources.map((ds) => (
                        <tr key={ds.sourceId} className="text-[#CEC8BC]">
                          <td className="py-1 pr-2">{ds.sourceName}</td>
                          <td className="py-1 pr-2">
                            {ds.mission} · {ds.instrument}
                          </td>
                          <td className="py-1 pr-2 text-[#5E9C76]">{ds.status}</td>
                          <td className="py-1">{ds.retrievedAt.slice(0, 19)}Z</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mp-surface-recessed p-3.5 space-y-2">
                <div className="font-telemetry text-[10px] tracking-wider text-[#C44D2B]">
                  Declared limitations &amp; modeling assumptions
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-[#CEC8BC]">
                  <div>
                    <div className="font-telemetry text-[10px] text-[#9D968A]">Data coverage</div>
                    {brief.limitations.dataCoverage.map((l, i) => (
                      <div key={i}>• {l}</div>
                    ))}
                  </div>
                  <div>
                    <div className="font-telemetry text-[10px] text-[#9D968A]">Resolution</div>
                    {brief.limitations.resolution.map((l, i) => (
                      <div key={i}>• {l}</div>
                    ))}
                  </div>
                  <div>
                    <div className="font-telemetry text-[10px] text-[#9D968A]">Temporal scope</div>
                    {brief.limitations.temporalLimitations.map((l, i) => (
                      <div key={i}>• {l}</div>
                    ))}
                  </div>
                  <div>
                    <div className="font-telemetry text-[10px] text-[#9D968A]">Modeling assumptions</div>
                    {brief.limitations.modelingAssumptions.map((l, i) => (
                      <div key={i}>• {l}</div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="font-telemetry text-[10px] text-[#9D968A] border-t border-[#242832] pt-3">
                {brief.nasaDisclaimer}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
