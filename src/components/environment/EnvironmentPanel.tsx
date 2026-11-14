import React from 'react';
import type { EnvironmentContextResponse } from '../../../shared/types';
import {
  CalmEmptyState,
  MetadataAccordion,
  MetricDisplay,
  ScienceLoadingState,
} from '../ui/InstrumentPrimitives';
import { CloudSun, ExternalLink, ShieldAlert } from 'lucide-react';

interface EnvironmentPanelProps {
  environment: EnvironmentContextResponse | null;
  loading: boolean;
}

export const EnvironmentPanel: React.FC<EnvironmentPanelProps> = ({ environment, loading }) => {
  if (loading) {
    return (
      <ScienceLoadingState
        title="SYNCHRONIZING ENVIRONMENT"
        subtitle="Loading historical Curiosity REMS weather and PDS-PPI RAD radiation dosimetry."
      />
    );
  }

  if (!environment) {
    return (
      <CalmEmptyState
        title="Environmental context unavailable"
        suggestion="Historical Curiosity REMS and RAD records could not be retrieved from upstream feeds."
      />
    );
  }

  const latestRems = environment.rems.records[0] ?? null;
  const latestRad = environment.rad.records[0] ?? null;

  return (
    <div className="space-y-4">
      {/* REMS Meteorology */}
      <section className="mp-surface-recessed p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#EAE4D9]">
            <CloudSun className="w-3.5 h-3.5 text-[#D4B483]" />
            <span>Surface weather (REMS archive)</span>
          </div>
          <span className="text-[10px] font-telemetry text-[#5E9C76]">
            {environment.rems.available ? 'Historical archive' : 'DATA UNAVAILABLE'}
          </span>
        </div>

        <p className="text-xs text-[#9D968A] leading-relaxed">{environment.rems.statement}</p>

        {latestRems ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MetricDisplay
                label="Latest sol"
                value={`Sol ${latestRems.sol}`}
                unit={latestRems.terrestrialDate}
              />
              <MetricDisplay
                label="Air temp range"
                value={`${latestRems.minTempC ?? 'N/A'}..${latestRems.maxTempC ?? 'N/A'}`}
                unit="°C"
                accent="ochre"
              />
              <MetricDisplay
                label="Pressure"
                value={latestRems.pressurePa ?? 'N/A'}
                unit={latestRems.pressurePa !== null ? 'Pa' : undefined}
              />
              <MetricDisplay
                label="Solar longitude"
                value={latestRems.ls !== null ? `Ls ${latestRems.ls}` : 'N/A'}
                unit={latestRems.ls !== null ? `° · ${latestRems.uvIndex}` : undefined}
                accent="sand"
              />
            </div>

            <MetadataAccordion label="Recent REMS sol records">
              <div className="overflow-x-auto border border-[#242832]">
                <table className="w-full text-left text-[10px] font-telemetry">
                  <thead className="bg-[#111317] text-[#736D63] border-b border-[#242832]">
                    <tr>
                      <th className="p-1.5">Sol</th>
                      <th className="p-1.5">Date</th>
                      <th className="p-1.5">Air °C</th>
                      <th className="p-1.5">Pres (Pa)</th>
                      <th className="p-1.5">UV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#242832]">
                    {environment.rems.records.slice(0, 8).map((r) => (
                      <tr key={r.sol} className="text-[#9D968A]">
                        <td className="p-1.5">{r.sol}</td>
                        <td className="p-1.5">{r.terrestrialDate}</td>
                        <td className="p-1.5">
                          {r.minTempC ?? '—'}..{r.maxTempC ?? '—'}
                        </td>
                        <td className="p-1.5">{r.pressurePa ?? '—'}</td>
                        <td className="p-1.5">{r.uvIndex}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MetadataAccordion>
          </>
        ) : (
          <div className="text-xs text-[#D98A4E]">DATA UNAVAILABLE for REMS feed.</div>
        )}

        <a
          href={environment.rems.provenance.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-telemetry text-[#D4B483] underline"
        >
          {environment.rems.provenance.attribution} <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </section>

      {/* PDS-PPI RAD Radiation Dosimetry */}
      <section className="mp-surface-recessed p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#EAE4D9]">
            <ShieldAlert className="w-3.5 h-3.5 text-[#D4B483]" />
            <span>Surface radiation (RAD dosimetry)</span>
          </div>
          <span className="text-[10px] font-telemetry text-[#5E9C76]">
            {environment.rad.available ? 'Historical RDR' : 'DATA UNAVAILABLE'}
          </span>
        </div>

        <p className="text-xs text-[#9D968A] leading-relaxed">{environment.rad.statement}</p>

        {latestRad ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MetricDisplay label="Latest parsed sol" value={`Sol ${latestRad.sol}`} />
              <MetricDisplay
                label="Detector B rate"
                value={
                  latestRad.doseRateBPerDay !== null
                    ? latestRad.doseRateBPerDay.toFixed(3)
                    : 'N/A'
                }
                unit={latestRad.doseRateBPerDay !== null ? 'mGy/day' : undefined}
                accent="ochre"
              />
            </div>

            <MetadataAccordion label="RAD Level-3 product archive">
              <div className="overflow-x-auto border border-[#242832]">
                <table className="w-full text-left text-[10px] font-telemetry">
                  <thead className="bg-[#111317] text-[#736D63] border-b border-[#242832]">
                    <tr>
                      <th className="p-1.5">Sol</th>
                      <th className="p-1.5">UTC</th>
                      <th className="p-1.5">Dose B (mGy/d)</th>
                      <th className="p-1.5">Product</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#242832]">
                    {environment.rad.records.map((rad) => (
                      <tr key={rad.productId} className="text-[#9D968A]">
                        <td className="p-1.5">{rad.sol}</td>
                        <td className="p-1.5">{rad.startUtc.slice(0, 10)}</td>
                        <td className="p-1.5">
                          {rad.doseRateBPerDay !== null ? rad.doseRateBPerDay.toFixed(3) : '—'}
                        </td>
                        <td className="p-1.5 truncate max-w-[120px]">{rad.productId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MetadataAccordion>
          </>
        ) : (
          <div className="text-xs text-[#D98A4E]">
            DATA UNAVAILABLE — Historical RAD Level-3 RDR records could not be retrieved.
          </div>
        )}

        <a
          href={environment.rad.provenance.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-telemetry text-[#D4B483] underline"
        >
          {environment.rad.provenance.attribution} <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </section>
    </div>
  );
};
