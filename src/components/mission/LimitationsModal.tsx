import React from 'react';
import { ShieldAlert, X } from 'lucide-react';

interface LimitationsModalProps {
  open: boolean;
  onClose: () => void;
}

export const LimitationsModal: React.FC<LimitationsModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scientific Limitations and Provenance Methodology"
      className="fixed inset-0 z-50 bg-[#07080A]/85 flex items-center justify-center p-4"
    >
      <div className="mp-instrument-panel mp-reticle-frame max-w-2xl w-full max-h-[85vh] flex flex-col mp-settle-in">
        <div className="p-4 border-b border-[#242832] bg-[#0B0D10] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-telemetry text-[#D98A4E]">
            <ShieldAlert className="w-4 h-4" />
            <span>SCIENTIFIC LIMITATIONS &amp; METHODOLOGY</span>
          </div>
          <button
            type="button"
            aria-label="Close Limitations"
            onClick={onClose}
            className="p-1 text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto mp-scroll space-y-4 text-xs text-[#CEC8BC] leading-relaxed">
          <section className="mp-surface-recessed p-3 space-y-1">
            <h3 className="font-telemetry text-[11px] text-[#D4B483]">01. Data Coverage Boundaries</h3>
            <p>
              High-resolution 1 m/px topography (Gale_DEM_SMG_1m) covers 137.1225°E–137.7298°E and 4.9255°S–4.2490°S.
              Points outside this footprint automatically fall back to the 200 m/px MOLA+HRSC blended global DEM or
              explicitly report DATA UNAVAILABLE.
            </p>
          </section>

          <section className="mp-surface-recessed p-3 space-y-1">
            <h3 className="font-telemetry text-[11px] text-[#D4B483]">02. Resolution &amp; Sub-Grid Hazards</h3>
            <p>
              Corridor A* terrain grids aggregate DEM samples at ~30–90 m cell spacing for interactive speed.
              Sub-grid boulders, sharp ventifacts, overhangs, dust-filled hollows, and regolith bearing capacity cannot
              be resolved from orbital elevation grids alone.
            </p>
          </section>

          <section className="mp-surface-recessed p-3 space-y-1">
            <h3 className="font-telemetry text-[11px] text-[#D4B483]">03. Temporal Limitations</h3>
            <p>
              MSL REMS meteorology and PDS-PPI RAD radiation dosimetry represent historical measurements recorded by
              Curiosity at its traverse positions. They are NOT real-time conditions, weather forecasts, or crew dose
              certifications.
            </p>
          </section>

          <section className="mp-surface-recessed p-3 space-y-1">
            <h3 className="font-telemetry text-[11px] text-[#D4B483]">04. Explicit Modeling Assumptions</h3>
            <p>
              Walking effort and speed estimates adapt terrestrial hiking models (Tobler-style slope scaling) with a
              configurable user slope threshold (default 18°). Candidate route outputs are decision-support comparisons
              only — MARS//PATH does not certify passability or EVA safety.
            </p>
          </section>

          <section className="mp-surface-recessed p-3 space-y-1">
            <h3 className="font-telemetry text-[11px] text-[#D4B483]">05. Missing Data Honesty</h3>
            <p>
              Curiosity raw images that do not match an authoritative MSL waypoint site/drive entry are explicitly tagged
              UNLOCATED rather than assigned approximate coordinates.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
