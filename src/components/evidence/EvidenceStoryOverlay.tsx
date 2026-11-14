import React from 'react';
import { usePlanetStore } from '../../store/planetStore';
import type { ScienceTarget } from '../../../shared/types';
import { ChevronLeft, ChevronRight, Layers, Navigation, X } from 'lucide-react';

interface EvidenceStoryOverlayProps {
  targets: ScienceTarget[];
  onPlanWalkToTarget: (target: ScienceTarget) => void;
}

interface StoryStep {
  shortLabel: string;
  title: string;
  what: string;
  why: string;
  layers: string[];
  zoom: number;
}

const STORY_STEPS: StoryStep[] = [
  {
    shortLabel: 'Terrain',
    title: '01. Elevation & Slope',
    what: 'Elevation across Gale Crater and lower Mount Sharp from MOLA/HRSC and 1 m/px local DEM.',
    why: 'Slope and elevation rise set physical limits on where explorers or rovers can climb.',
    layers: ['trek-mola-hrsc-clr', 'trek-gale-dem-1m'],
    zoom: 11.8,
  },
  {
    shortLabel: 'Geology',
    title: '02. Geologic Units & Dunes',
    what: 'USGS SIM 3292 regional geologic units and mapped Bagnold dark sand dune fields.',
    why: 'Distinguishes layered lakebed mudstones from loose sand traps that block traverses.',
    layers: ['trek-ctx-gale', 'usgs-sim3292-geo', 'trek-dune-fields'],
    zoom: 12.6,
  },
  {
    shortLabel: 'Minerals',
    title: '03. Orbital Imagery & Minerals',
    what: 'HiRISE 0.25 m/px orbital imagery overlaid with CRISM/OMEGA hydrated clay and sulfate detections.',
    why: 'Minerals altered by ancient liquid water pinpoint outcrops worth investigating up close.',
    layers: ['trek-hirise-curiosity', 'trek-crism-spectral'],
    zoom: 13.4,
  },
  {
    shortLabel: 'Rover',
    title: '04. Curiosity Ground Truth',
    what: 'Curiosity’s verified traverse track and localized Mastcam/ChemCam surface imagery.',
    why: 'Ground-truth photography confirms whether orbital mineral clues hold true at the surface.',
    layers: ['trek-hirise-curiosity', 'msl-rover-observations', 'trek-crism-spectral'],
    zoom: 13.8,
  },
  {
    shortLabel: 'Target',
    title: '05. Evidence Convergence',
    what: 'Ranked candidate destinations where geology, spectroscopy, imagery, and terrain all agree.',
    why: 'Selecting a high-convergence site lets you evaluate realistic Marswalk routes immediately.',
    layers: ['trek-hirise-curiosity', 'usgs-sim3292-geo', 'trek-crism-spectral', 'msl-rover-observations'],
    zoom: 14.0,
  },
];

export const EvidenceStoryOverlay: React.FC<EvidenceStoryOverlayProps> = ({
  targets,
  onPlanWalkToTarget,
}) => {
  const {
    evidenceStoryActive,
    evidenceStoryStep,
    selectedTargetId,
    setEvidenceStory,
    setLayersExact,
    setCamera,
    selectTarget,
  } = usePlanetStore();

  if (!evidenceStoryActive) return null;

  const stepIdx = Math.max(0, Math.min(STORY_STEPS.length - 1, evidenceStoryStep));
  const step = STORY_STEPS[stepIdx];
  const topTarget = targets.find((t) => t.id === selectedTargetId) ?? targets[0] ?? null;

  const goToStep = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(STORY_STEPS.length - 1, nextIdx));
    const s = STORY_STEPS[clamped];
    setEvidenceStory(true, clamped);
    setLayersExact(s.layers);

    if (clamped >= 3 && topTarget) {
      selectTarget(topTarget.id);
      setCamera({ lon: topTarget.coordinates[0], lat: topTarget.coordinates[1], zoom: s.zoom });
    } else {
      setCamera({ lon: 137.3889, lat: -4.775, zoom: s.zoom });
    }
  };

  return (
    <div
      role="region"
      aria-label="Follow the Evidence Story"
      className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[92vw] max-w-xl mp-instrument-panel mp-reticle-frame p-4 mp-settle-in"
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2 text-[11px] font-telemetry text-[#D4B483]">
          <Layers className="w-3.5 h-3.5" />
          <span>Follow the Evidence · Stage {stepIdx + 1} of {STORY_STEPS.length}</span>
        </div>
        <button
          type="button"
          aria-label="Close evidence story"
          onClick={() => setEvidenceStory(false)}
          className="text-[#9D968A] hover:text-[#F7F3EB] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Calibrated 5-Stage Stepper Rail */}
      <div className="grid grid-cols-5 gap-1.5 pb-3">
        {STORY_STEPS.map((s, idx) => {
          const isDoneOrCurrent = idx <= stepIdx;
          const isCurrent = idx === stepIdx;
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => goToStep(idx)}
              className="text-left group cursor-pointer"
            >
              <div
                className={`h-1 transition-colors ${
                  isCurrent ? 'bg-[#C44D2B]' : isDoneOrCurrent ? 'bg-[#D4B483]' : 'bg-[#242832]'
                }`}
              />
              <div
                className={`mt-1 text-[10px] font-telemetry truncate ${
                  isCurrent ? 'text-[#F7F3EB]' : isDoneOrCurrent ? 'text-[#D4B483]' : 'text-[#736D63]'
                }`}
              >
                {s.shortLabel}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mp-hairline mb-3" />

      <div className="space-y-1.5">
        <h3 className="font-editorial text-base font-medium text-[#F7F3EB]">{step.title}</h3>
        <p className="text-xs text-[#EAE4D9] leading-relaxed">{step.what}</p>
        <p className="text-xs text-[#9D968A] leading-relaxed">
          <span className="text-[#D4B483] font-medium">Why it matters: </span>
          {step.why}
        </p>
      </div>

      <div className="mt-3 pt-2.5 border-t border-[#242832] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goToStep(stepIdx - 1)}
          disabled={stepIdx === 0}
          className="mp-btn-secondary min-h-[34px] px-3 text-xs disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Previous</span>
        </button>

        {stepIdx === STORY_STEPS.length - 1 && topTarget ? (
          <button
            type="button"
            onClick={() => {
              setEvidenceStory(false);
              onPlanWalkToTarget(topTarget);
            }}
            className="mp-btn-primary min-h-[34px] px-3.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Plan a Marswalk</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goToStep(stepIdx + 1)}
            className="mp-btn-primary min-h-[34px] px-3.5 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Next stage</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
